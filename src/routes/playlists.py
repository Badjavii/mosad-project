# src/routes/playlists.py
# Handles playlist management and audio downloads (saved locally, not sent to browser).

import os
import threading
from concurrent.futures import ThreadPoolExecutor
from flask import Blueprint, render_template, request, jsonify
from src.services import playlist_service as ps
from src.services.download_service import download_audio, write_metadata, build_file_name

playlists_bp = Blueprint("playlists", __name__)

DOWNLOAD_WORKERS = 4   # parallel download threads for playlist
SINGLES_DIR      = os.path.join("downloads", "singles")

# In-memory job state for download progress tracking
_jobs: dict = {}
_jobs_lock = threading.Lock()


@playlists_bp.route("/playlists")
def playlists_page():
    return render_template("pages/playlists.html")


# ── Playlist CRUD ─────────────────────────────────────────────────────────────

@playlists_bp.route("/api/playlists", methods=["GET"])
def api_list_playlists():
    return jsonify({"playlists": ps.list_playlists()})


@playlists_bp.route("/api/playlists", methods=["POST"])
def api_create_playlist():
    data = request.get_json(force=True)
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Playlist name is required"}), 400
    playlist = ps.create_playlist(name)
    return jsonify(playlist), 201


@playlists_bp.route("/api/playlists/<playlist_id>", methods=["GET"])
def api_get_playlist(playlist_id):
    playlist = ps.get_playlist(playlist_id)
    if not playlist:
        return jsonify({"error": "Playlist not found"}), 404
    return jsonify(playlist)


@playlists_bp.route("/api/playlists/<playlist_id>", methods=["DELETE"])
def api_delete_playlist(playlist_id):
    if not ps.delete_playlist(playlist_id):
        return jsonify({"error": "Playlist not found"}), 404
    return jsonify({"ok": True})


@playlists_bp.route("/api/playlists/import", methods=["POST"])
def api_import_playlist():
    import tempfile
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if not file.filename.endswith(".json"):
        return jsonify({"error": "File must be a .json"}), 400

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name

    try:
        playlist = ps.import_playlist(tmp_path)
        return jsonify(playlist), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    finally:
        os.unlink(tmp_path)


# ── Songs (order is the primary key) ─────────────────────────────────────────

@playlists_bp.route("/api/playlists/<playlist_id>/songs", methods=["POST"])
def api_add_song(playlist_id):
    data = request.get_json(force=True)
    required = ["title", "artist", "youtube_url"]
    for field in required:
        if not data.get(field, "").strip():
            return jsonify({"error": f"Missing field: {field}"}), 400

    song = {
        "title":       data["title"].strip(),
        "artist":      data["artist"].strip(),
        "album":       data.get("album", "").strip() or None,
        "youtube_url": data["youtube_url"].strip(),
        "file_name":   build_file_name(data["artist"], data["title"]),
    }

    try:
        added = ps.add_song(playlist_id, song)
        return jsonify(added), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 404


@playlists_bp.route("/api/playlists/<playlist_id>/songs/<int:order>", methods=["PUT"])
def api_update_song(playlist_id, order):
    data = request.get_json(force=True)
    updates = {k: v for k, v in data.items() if k in ["title", "artist", "album"]}

    # Recalculate file_name if title or artist changed
    playlist = ps.get_playlist(playlist_id)
    if playlist:
        song = next((s for s in playlist["songs"] if s["order"] == order), None)
        if song:
            new_artist = updates.get("artist", song["artist"])
            new_title  = updates.get("title", song["title"])
            updates["file_name"] = build_file_name(new_artist, new_title)

    try:
        updated = ps.update_song(playlist_id, order, updates)
        return jsonify(updated)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404


@playlists_bp.route("/api/playlists/<playlist_id>/songs/<int:order>", methods=["DELETE"])
def api_remove_song(playlist_id, order):
    try:
        ps.remove_song(playlist_id, order)
        return jsonify({"ok": True})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404


@playlists_bp.route("/api/playlists/<playlist_id>/songs/reorder", methods=["PUT"])
def api_reorder_songs(playlist_id):
    data = request.get_json(force=True)
    ordered_orders = data.get("ordered_orders", [])
    if not ordered_orders:
        return jsonify({"error": "ordered_orders is required"}), 400
    try:
        songs = ps.reorder_songs(playlist_id, ordered_orders)
        return jsonify({"songs": songs})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404


# ── Download single song from playlist (saved locally) ────────────────────────

@playlists_bp.route("/api/playlists/<playlist_id>/songs/<int:order>/download", methods=["POST"])
def api_download_song(playlist_id, order):
    """Download a single song from a playlist and save it locally."""
    playlist = ps.get_playlist(playlist_id)
    if not playlist:
        return jsonify({"error": "Playlist not found"}), 404

    song = next((s for s in playlist["songs"] if s["order"] == order), None)
    if not song:
        return jsonify({"error": "Song not found"}), 404

    try:
        os.makedirs(SINGLES_DIR, exist_ok=True)
        file_path = download_audio(song["youtube_url"], SINGLES_DIR, song["file_name"])
        write_metadata(file_path, title=song["title"], artist=song["artist"], album=song.get("album"))
        return jsonify({"ok": True, "saved_to": file_path})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Download full playlist (parallel, progress tracking) ─────────────────────

@playlists_bp.route("/api/playlists/<playlist_id>/download", methods=["POST"])
def api_download_playlist(playlist_id):
    """
    Start a background job to download all songs in a playlist.
    Songs are saved to downloads/playlists/ply-{playlist_name}/.
    Returns a job_id to poll for progress.
    """
    playlist = ps.get_playlist(playlist_id)
    if not playlist:
        return jsonify({"error": "Playlist not found"}), 404
    if not playlist["songs"]:
        return jsonify({"error": "Playlist is empty"}), 400

    job_id = playlist_id
    with _jobs_lock:
        _jobs[job_id] = {
            "status":   "starting",
            "total":    len(playlist["songs"]),
            "done":     0,
            "failed":   0,
            "current":  [],
            "log":      [],
        }

    thread = threading.Thread(
        target=_run_playlist_download,
        args=(job_id, playlist),
        daemon=True,
    )
    thread.start()

    return jsonify({"job_id": job_id}), 202


@playlists_bp.route("/api/playlists/<playlist_id>/download/progress", methods=["GET"])
def api_download_progress(playlist_id):
    """Poll the progress of a playlist download job."""
    with _jobs_lock:
        job = _jobs.get(playlist_id)
        if not job:
            return jsonify({"error": "No active download job for this playlist"}), 404
        snapshot = dict(job)
        snapshot["current"] = list(job["current"])
        snapshot["log"]     = job["log"][-50:]
    return jsonify(snapshot)


# ── Background download worker ────────────────────────────────────────────────

def _run_playlist_download(job_id: str, playlist: dict) -> None:
    """Download all songs in parallel using a thread pool."""
    safe_name = playlist["name"].lower().replace(" ", "-")
    out_dir   = os.path.join("downloads", "playlists", f"ply-{safe_name}")
    os.makedirs(out_dir, exist_ok=True)

    _update_job(job_id, status="downloading")

    songs = sorted(playlist["songs"], key=lambda s: s["order"])

    with ThreadPoolExecutor(max_workers=DOWNLOAD_WORKERS) as executor:
        futures = {executor.submit(_download_one, job_id, song, out_dir): song for song in songs}
        for _ in futures:
            pass

    with _jobs_lock:
        job = _jobs[job_id]
        job["status"] = "done" if job["failed"] == 0 else "done_with_errors"


def _download_one(job_id: str, song: dict, out_dir: str) -> None:
    """Download a single song and update job state."""
    title = song["title"]
    _add_current(job_id, title)
    try:
        file_path = download_audio(song["youtube_url"], out_dir, song["file_name"])
        write_metadata(file_path, title=song["title"], artist=song["artist"], album=song.get("album"))
        _add_log(job_id, f"✓ {title}")
        _update_job(job_id, done_delta=1)
    except Exception as e:
        _add_log(job_id, f"✗ {title}: {e}")
        _update_job(job_id, failed_delta=1, done_delta=1)
    finally:
        _remove_current(job_id, title)


# ── Job state helpers ─────────────────────────────────────────────────────────

def _update_job(job_id: str, status: str = None, done_delta: int = 0, failed_delta: int = 0) -> None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return
        if status:
            job["status"] = status
        job["done"]   += done_delta
        job["failed"] += failed_delta


def _add_log(job_id: str, message: str) -> None:
    with _jobs_lock:
        _jobs.get(job_id, {}).get("log", []) and _jobs[job_id]["log"].append(message)
        if job_id in _jobs:
            _jobs[job_id]["log"].append(message)


def _add_current(job_id: str, title: str) -> None:
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id]["current"].append(title)


def _remove_current(job_id: str, title: str) -> None:
    with _jobs_lock:
        if job_id in _jobs:
            try:
                _jobs[job_id]["current"].remove(title)
            except ValueError:
                pass

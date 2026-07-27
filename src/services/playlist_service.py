# src/services/playlist_service.py
# Handles all playlist JSON read/write operations in playlists-data/.

import os
import json
import random
import string
from datetime import date

PLAYLISTS_DIR = "playlists-data"
MOSAD_HEADER  = "mosad-playlist-json"   # validation header
ID_LENGTH     = 4                        # short alphanumeric ID length


# ── ID generation ─────────────────────────────────────────────────────────────

def _generate_id() -> str:
    """Generate a short 4-character alphanumeric ID (e.g. 'a3kz')."""
    chars = string.ascii_lowercase + string.digits
    return "".join(random.choices(chars, k=ID_LENGTH))


def _unique_playlist_id() -> str:
    """Generate an ID that does not collide with any existing playlist file."""
    existing = _existing_ids()
    while True:
        new_id = _generate_id()
        if new_id not in existing:
            return new_id


def _existing_ids() -> set:
    """Return the set of IDs already in use in playlists-data/."""
    _ensure_dir()
    ids = set()
    for filename in os.listdir(PLAYLISTS_DIR):
        if not filename.endswith(".json"):
            continue
        path = os.path.join(PLAYLISTS_DIR, filename)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("id"):
                ids.add(data["id"])
        except (json.JSONDecodeError, KeyError):
            continue
    return ids


# ── File naming ───────────────────────────────────────────────────────────────

def _playlist_filename(playlist_id: str, name: str) -> str:
    """
    Build the JSON filename in the format:
    ply{id}-{name}-{YYYYMMDD}.json
    e.g. plya3kz-my-playlist-20260727.json
    """
    safe_name = name.lower().strip().replace(" ", "-")
    safe_name = "".join(c for c in safe_name if c.isalnum() or c == "-")
    today = date.today().strftime("%Y%m%d")
    return f"ply{playlist_id}-{safe_name}-{today}.json"


def _playlist_path(playlist_id: str, name: str) -> str:
    return os.path.join(PLAYLISTS_DIR, _playlist_filename(playlist_id, name))


def _find_playlist_path(playlist_id: str) -> str | None:
    """Find the file path for a playlist by its ID, regardless of filename."""
    _ensure_dir()
    for filename in os.listdir(PLAYLISTS_DIR):
        if filename.startswith(f"ply{playlist_id}-") and filename.endswith(".json"):
            return os.path.join(PLAYLISTS_DIR, filename)
    return None


def _ensure_dir() -> None:
    os.makedirs(PLAYLISTS_DIR, exist_ok=True)


# ── CRUD ──────────────────────────────────────────────────────────────────────

def list_playlists() -> list:
    """Return summary info for all valid playlists in playlists-data/."""
    _ensure_dir()
    playlists = []
    for filename in os.listdir(PLAYLISTS_DIR):
        if not filename.endswith(".json"):
            continue
        path = os.path.join(PLAYLISTS_DIR, filename)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("mosad") != MOSAD_HEADER:
                continue
            playlists.append({
                "id":         data["id"],
                "name":       data["name"],
                "created_at": data.get("created_at", ""),
                "song_count": len(data.get("songs", [])),
            })
        except (json.JSONDecodeError, KeyError):
            continue
    return sorted(playlists, key=lambda p: p["name"].lower())


def get_playlist(playlist_id: str) -> dict | None:
    """Return the full playlist data or None if not found/invalid."""
    path = _find_playlist_path(playlist_id)
    if not path:
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if data.get("mosad") != MOSAD_HEADER:
            return None
        return data
    except (json.JSONDecodeError, KeyError):
        return None


def create_playlist(name: str) -> dict:
    """Create a new playlist JSON and return it."""
    _ensure_dir()
    playlist_id = _unique_playlist_id()
    playlist = {
        "mosad":      MOSAD_HEADER,
        "id":         playlist_id,
        "name":       name.strip(),
        "created_at": date.today().strftime("%Y-%m-%d"),
        "songs":      [],
    }
    path = _playlist_path(playlist_id, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(playlist, f, indent=2, ensure_ascii=False)
    return playlist


def delete_playlist(playlist_id: str) -> bool:
    """Delete a playlist JSON. Returns True if deleted, False if not found."""
    path = _find_playlist_path(playlist_id)
    if not path:
        return False
    os.remove(path)
    return True


def import_playlist(source_path: str) -> dict:
    """
    Validate and copy an external JSON file into playlists-data/.
    Raises ValueError if the file is not a valid MOSAD playlist.
    If the ID collides with an existing one, a new unique ID is assigned.
    """
    with open(source_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if data.get("mosad") != MOSAD_HEADER:
        raise ValueError("This file is not a valid MOSAD playlist JSON.")
    if not data.get("id") or not data.get("name"):
        raise ValueError("Playlist is missing required fields.")

    _ensure_dir()

    # Resolve ID collision
    existing = _existing_ids()
    if data["id"] in existing:
        data["id"] = _unique_playlist_id()

    dest = _playlist_path(data["id"], data["name"])
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return data


# ── Songs (order as primary key, no song IDs) ─────────────────────────────────

def add_song(playlist_id: str, song: dict) -> dict:
    """Add a song to a playlist. Order is auto-assigned."""
    playlist = get_playlist(playlist_id)
    if not playlist:
        raise ValueError("Playlist not found.")

    song["order"] = len(playlist["songs"]) + 1
    playlist["songs"].append(song)
    _save(playlist)
    return song


def update_song(playlist_id: str, order: int, updates: dict) -> dict:
    """Update song metadata by order (order acts as primary key)."""
    playlist = get_playlist(playlist_id)
    if not playlist:
        raise ValueError("Playlist not found.")

    for song in playlist["songs"]:
        if song["order"] == order:
            for key, value in updates.items():
                if value is not None:
                    song[key] = value
            _save(playlist)
            return song

    raise ValueError("Song not found.")


def remove_song(playlist_id: str, order: int) -> None:
    """Remove a song by order and reindex remaining songs."""
    playlist = get_playlist(playlist_id)
    if not playlist:
        raise ValueError("Playlist not found.")

    playlist["songs"] = [s for s in playlist["songs"] if s["order"] != order]

    # Reindex
    for i, song in enumerate(playlist["songs"]):
        song["order"] = i + 1

    _save(playlist)


def reorder_songs(playlist_id: str, ordered_orders: list) -> list:
    """Reorder songs based on a list of order values in the desired sequence."""
    playlist = get_playlist(playlist_id)
    if not playlist:
        raise ValueError("Playlist not found.")

    songs_by_order = {s["order"]: s for s in playlist["songs"]}
    reordered = []
    for i, order in enumerate(ordered_orders):
        if order in songs_by_order:
            songs_by_order[order]["order"] = i + 1
            reordered.append(songs_by_order[order])

    playlist["songs"] = reordered
    _save(playlist)
    return reordered


# ── Internal save ─────────────────────────────────────────────────────────────

def _save(playlist: dict) -> None:
    path = _find_playlist_path(playlist["id"])
    if not path:
        path = _playlist_path(playlist["id"], playlist["name"])
    with open(path, "w", encoding="utf-8") as f:
        json.dump(playlist, f, indent=2, ensure_ascii=False)

# src/routes/single.py
# Handles single song search and download (saved locally, not sent to browser).

import os
from flask import Blueprint, render_template, request, jsonify
from src.services.search_service import search_youtube
from src.services.download_service import download_audio, write_metadata, build_file_name

single_bp = Blueprint("single", __name__)

SINGLES_DIR = os.path.join("downloads", "singles")


@single_bp.route("/single")
def single_page():
    return render_template("pages/single.html")


@single_bp.route("/api/search")
def api_search():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "Missing query parameter"}), 400

    try:
        results = search_youtube(query)
        return jsonify({"results": results})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@single_bp.route("/api/single/download", methods=["POST"])
def api_download_single():
    """Download a single song and save it locally to downloads/singles/."""
    data        = request.get_json(force=True)
    title       = data.get("title", "").strip()
    artist      = data.get("artist", "").strip()
    album       = data.get("album", "").strip() or None
    youtube_url = data.get("youtube_url", "").strip()

    if not title or not artist or not youtube_url:
        return jsonify({"error": "Missing required fields: title, artist, youtube_url"}), 400

    try:
        os.makedirs(SINGLES_DIR, exist_ok=True)
        file_name = build_file_name(artist, title)
        file_path = download_audio(youtube_url, SINGLES_DIR, file_name)
        write_metadata(file_path, title=title, artist=artist, album=album)
        return jsonify({"ok": True, "saved_to": file_path})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# src/services/search_service.py
# Handles YouTube search using yt-dlp's ytsearch extractor.

import yt_dlp


def search_youtube(query: str, limit: int = 10) -> list[dict]:
    """
    Search YouTube for a given query.
    Returns a list of result dicts with title, channel, duration, url, thumbnail.
    """
    ydl_opts = {
        "quiet": True,
        "extract_flat": True,
        "skip_download": True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        raw = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)

    results = []
    for item in raw.get("entries", []):
        duration_secs = item.get("duration") or 0
        minutes, seconds = divmod(int(duration_secs), 60)
        results.append({
            "title":     item.get("title", ""),
            "channel":   item.get("channel") or item.get("uploader", ""),
            "duration":  f"{minutes}:{seconds:02d}",
            "url":       f"https://www.youtube.com/watch?v={item['id']}",
            "thumbnail": item.get("thumbnail") or "",
        })

    return results

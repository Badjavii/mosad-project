# src/services/download_service.py
# Handles audio download via yt-dlp and metadata writing via mutagen.

import os
import re
from mutagen.id3 import ID3, TIT2, TPE1, TALB, ID3NoHeaderError


def to_kebab_case(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text


def download_audio(youtube_url: str, output_dir: str, file_name: str) -> str:
    """
    Download audio from a YouTube URL as MP3 320kbps.
    Returns the full path of the downloaded file.
    """
    import yt_dlp

    output_path = os.path.join(output_dir, file_name.replace(".mp3", ""))
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_path,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "320",
        }],
        "quiet": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([youtube_url])

    return f"{output_path}.mp3"


def write_metadata(
    file_path: str,
    title: str,
    artist: str,
    album: str | None = None,
) -> None:
    """Write ID3 tags to an MP3 file."""
    try:
        tags = ID3(file_path)
    except ID3NoHeaderError:
        tags = ID3()

    tags["TIT2"] = TIT2(encoding=3, text=title)
    tags["TPE1"] = TPE1(encoding=3, text=artist)
    if album:
        tags["TALB"] = TALB(encoding=3, text=album)

    tags.save(file_path)


def build_file_name(artist: str, title: str) -> str:
    return f"{to_kebab_case(artist)}-{to_kebab_case(title)}.mp3"

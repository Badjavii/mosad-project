"""
MOSAD — Music Open Source Application Desktop
----------------------------------------------
Self-hosted local app to search, manage and download music from YouTube.
Single-user, no database, no authentication. Just run and use.

Usage:
    pip install -r requirements.txt
    python app.py
    Open http://localhost:5001 in your browser
"""

import os
from flask import Flask
from src.routes.workspace import workspace_bp
from src.routes.single import single_bp
from src.routes.playlists import playlists_bp

app = Flask(__name__, template_folder="templates", static_folder="static")

# Register blueprints
app.register_blueprint(workspace_bp)
app.register_blueprint(single_bp)
app.register_blueprint(playlists_bp)

if __name__ == "__main__":
    # Ensure required directories exist on startup
    os.makedirs("playlists-data", exist_ok=True)
    os.makedirs("downloads/singles", exist_ok=True)
    print("MOSAD is running at http://localhost:5001")
    app.run(host="127.0.0.1", port=5001, debug=True, threaded=True)

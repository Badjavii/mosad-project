# src/routes/workspace.py
# Serves the main workspace page and the credits page.

from flask import Blueprint, render_template

workspace_bp = Blueprint("workspace", __name__)


@workspace_bp.route("/")
def index():
    return render_template("index.html")


@workspace_bp.route("/credits")
def credits():
    return render_template("pages/credits.html")

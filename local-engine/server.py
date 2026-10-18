"""Minimal localhost-only AfroStudio AI engine bridge.

This scaffold intentionally does not download or run a music model yet.
It provides a safe health/status API for the desktop app to connect to.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json

HOST = "127.0.0.1"
PORT = 7860
ALLOWED_ORIGINS = {"http://localhost:5173", "http://127.0.0.1:5173"}


class Handler(BaseHTTPRequestHandler):
    server_version = "AfroStudioLocalEngine/0.1"

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        origin = self.headers.get("Origin", "")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        origin = self.headers.get("Origin", "")
        self.send_response(204)
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Vary", "Origin")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {"status": "ok", "service": "afrostudio-local-engine", "version": "0.1.0"})
        elif self.path == "/status":
            self._send_json(200, {
                "status": "ok",
                "service": "afrostudio-local-engine",
                "model": {"installed": False, "ready": False, "name": None},
                "capabilities": {"health_check": True, "music_generation": False},
                "message": "Bridge is running; a compatible local music model is not installed or connected."
            })
        else:
            self._send_json(404, {"status": "error", "message": "Unknown endpoint. Try /health or /status."})

    def log_message(self, format_string, *args):
        print("[AfroStudio engine] " + (format_string % args))


if __name__ == "__main__":
    print(f"AfroStudio local engine bridge listening on http://{HOST}:{PORT}")
    print("Status endpoint: http://127.0.0.1:7860/status")
    print("This bridge does not generate music yet.")
    try:
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    except OSError as error:
        raise SystemExit(f"Could not start local engine bridge: {error}")

# AfroStudio local engine bridge (experimental)

This is the first local-service integration scaffold. It uses only Python's standard library; no pip packages, API key, cloud service, or model download is required to test the connection.

## Run on Windows

1. Install Python 3 if it is not already installed.
2. Open Command Prompt in this folder.
3. Run `py server.py`.
4. Keep that window open while testing the app.
5. In AfroStudio AI's Reference Track screen, keep the URL as `http://127.0.0.1:7860` and choose **Check connection**.

Use `http://127.0.0.1:7860/status` in a browser to inspect service status.

## What works today

- Binds only to `127.0.0.1` so the service is not exposed to your home network.
- Provides `GET /health` and `GET /status`.
- Allows CORS only from the default local Vite development origins.
- Uses Python's built-in HTTP server; no third-party package installation is needed.

## Important limitation

This is a connection bridge, **not an AI music generator**. The status endpoint deliberately reports `model.installed=false` and `capabilities.music_generation=false`. No model is downloaded, and the Generate button in the web app still creates procedural MIDI-style patterns. The next milestone must choose a model that can realistically run on the target PC, implement its local inference runtime, and connect generated audio to the Playlist. Do not treat a successful health check as proof that AI generation works.

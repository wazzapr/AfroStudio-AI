# AfroStudio AI local engine

This optional Python service connects AfroStudio AI to a separately running local ACE-Step API. It listens only on `127.0.0.1:7860` and does not expose the service to your network.

## What it does

- `GET /health`: confirms that the bridge is running.
- `GET /status`: checks whether an ACE-Step API is reachable.
- `POST /generate`: submits a prompt, BPM, and duration to ACE-Step.
- `GET /tasks/{task_id}`: checks generation progress.
- `GET /audio/{task_id}`: serves the generated audio when ready.

The bridge does **not** download model weights. By default it expects ACE-Step's API at `http://127.0.0.1:8001`. Set `ACESTEP_API_URL` if you use another local address, for example in PowerShell:

```powershell
$env:ACESTEP_API_URL = "http://127.0.0.1:8001"
py server.py
```

Start the bridge from this folder with `py server.py`. Keep the console open. The web app can connect to `http://127.0.0.1:7860`.

## Hardware and model limits

ACE-Step 1.5 is the first model adapter being tested because it supports full-song generation and reference-audio workflows. Its own install guide recommends at least 4 GB VRAM for its low-memory DiT-only mode. A GTX 750 Ti with 2 GB VRAM is below that recommendation; CPU-only operation may be very slow or fail. Do not assume this PC can run it successfully, and do not download several gigabytes of model files without checking available disk space first.

This bridge currently supports **text-prompt-to-audio only**. Reference audio upload/style transfer is not wired into this adapter yet. The generated audio is returned to the app through a local task/audio endpoint; it does not use a paid API. Keep reference prompts broad and original rather than requesting a copy of a particular copyrighted song.

## Test the bridge

From this folder:

```powershell
py -m unittest -v
```

Tests exercise the local HTTP endpoints without requiring ACE-Step or downloading a model.

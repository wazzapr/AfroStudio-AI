# AfroStudio AI local engine

This optional Python service connects AfroStudio AI to a separately running local ACE-Step API. It listens only on \`127.0.0.1:7860\` and does not expose the service to your network.

## Windows setup helper

From the downloaded project folder, open PowerShell in \`local-engine\` and run:

\`\`\`powershell
Set-ExecutionPolicy -Scope Process Bypass
.\setup-windows.ps1
\`\`\`

The helper checks for Python 3.10–3.13, checks available disk space, reports NVIDIA GPU memory when \`nvidia-smi\` is available, creates a private Python virtual environment for the bridge, and can start the bridge. The bridge has no third-party Python package dependencies.

**Important:** this is setup groundwork, not the final one-click AfroStudio installer. It does not install ACE-Step or download model weights. The model installation must wait until a compatible backend and safe hardware-specific install path are verified. In particular, a GTX 750 Ti with 2 GB VRAM is below the currently documented 4 GB recommendation for ACE-Step 1.5's low-memory mode; CPU generation may be extremely slow or fail.

## What the bridge does

- \`GET /health\`: confirms that the bridge is running.
- \`GET /status\`: checks whether an ACE-Step API is reachable.
- \`POST /generate\`: submits a prompt, BPM, duration, and optionally a reference audio upload (multipart form data) to ACE-Step.
- \`GET /tasks/{task_id}\`: checks generation progress.
- \`GET /audio/{task_id}\`: serves generated audio when ready.

By default, it expects ACE-Step's API at \`http://127.0.0.1:8001\`. Set \`ACESTEP_API_URL\` if you use another local address. To start the bridge manually after setup:

\`\`\`powershell
.\.venv\Scripts\python.exe server.py
\`\`\`

Keep the console open. The web app can connect to \`http://127.0.0.1:7860\`.

## Test the bridge

From this folder:

\`\`\`powershell
.\.venv\Scripts\python.exe -m unittest -v
\`\`\`

Tests do not require ACE-Step or download a model.

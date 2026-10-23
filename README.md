# AfroStudio AI

A free-first, Windows-focused music production studio inspired by familiar DAW workflows, with Afro House tools and an AI reference-track workflow.

## Current milestone

The project is an early, actively developed browser-based studio foundation. Current features include:

- Playlist with draggable pattern/audio clips, transport, tempo control, and arrangement playback.
- Local browser audio playback for synthesized drum patterns, bass/melody notes, and an imported reference track.
- Channel Rack and Piano Roll editing, lightweight synth presets, starter playback effects, project save/load, and WAV arrangement export.
- Local procedural Afro House idea generation. This is not a trained AI music-generation model.
- Experimental local reference-audio analysis and an optional local Python bridge for a separately running ACE-Step API.
- Keyboard shortcuts for transport, navigation, undo/redo, duplication, save, and deleting selected items.
- An in-app Updates page that checks the latest commit on GitHub and opens a download of the latest branch ZIP. Because the app is currently a browser-based Vite app, this is a source-download helper, not yet a one-click self-installing updater.

## Windows setup status

A Windows desktop build is now being added with Electron. The Windows Installer workflow builds a setup `.exe`, bundles the local Python bridge into a standalone Windows executable, and publishes the installer as a downloadable GitHub Actions artifact when the build succeeds. The packaged app serves its interface locally and starts the bridge automatically. The \`local-engine/setup-windows.ps1\` helper is an early setup step: it checks Python, disk space, and NVIDIA GPU information, prepares the local bridge environment, and can start the bridge.

**The helper does not install ACE-Step or download AI model weights yet.** We must verify a safe, compatible installation route before automating multi-gigabyte downloads. The current PC described by the project owner has a GTX 750 Ti with 2 GB VRAM; ACE-Step 1.5's documented low-memory recommendation is at least 4 GB, so compatibility cannot be promised. No paid generation API is required by the design.

## Known limitations

- Not yet a replacement for FL Studio; audio scheduling and the interface still need further development and testing.
- AI full-song generation from uploaded audio requires a compatible local model service; the bridge alone does not generate music.
- VST3/plugin hosting, sample library management, automation, and a low-latency desktop audio engine remain future milestones.
- The desktop installer bundles the studio interface and a standalone local bridge executable, so the bridge does not require a separate Python installation. It does not install an AI music-generation model, and the installer still needs testing on a real Windows PC.

## Try it on Windows

To get the Windows installer, open [GitHub Actions](https://github.com/wazzapr/AfroStudio-AI/actions/workflows/windows-installer.yml), select the latest successful **Windows installer** run, and download the `AfroStudio-AI-Windows-Installer` artifact. Extract the artifact ZIP and run the `.exe` inside it. This installer is an early build; it bundles the bridge but does not install the AI model. If the workflow has not completed successfully yet, use the source ZIP steps below as a temporary fallback.

To try the latest source on Windows without the installer:

1. Download the [latest project ZIP](https://github.com/wazzapr/AfroStudio-AI/archive/refs/heads/feat/studio-foundation.zip).
2. Extract the ZIP to a normal folder, for example `Desktop\AfroStudio-AI`.
3. Make sure Node.js LTS is installed from [nodejs.org](https://nodejs.org/).
4. Open the extracted folder and double-click `START-AFROSTUDIO-WINDOWS.bat`.
5. On first launch, the script runs `npm install`, which needs an internet connection. When the app starts, it opens `http://127.0.0.1:5173` in your browser.
6. Keep the black command window open while using the app. Press `Ctrl+C` there to stop it.

If Windows SmartScreen warns about a script downloaded from the internet, only run it if you downloaded the ZIP from this official repository and are comfortable reviewing the script first. The launcher runs project dependency installation and starts the local Vite development server; it is **not** a standalone installer and does not install the AI music model.

## Development

The initial stack is React, TypeScript, and Vite. Run `npm install`, then `npm run dev`; run `npm run build` for the TypeScript and production build check.

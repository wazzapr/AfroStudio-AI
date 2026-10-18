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

The app is still a Vite web app; a packaged Windows installer is not available yet. The \`local-engine/setup-windows.ps1\` helper is an early setup step: it checks Python, disk space, and NVIDIA GPU information, prepares the local bridge environment, and can start the bridge.

**The helper does not install ACE-Step or download AI model weights yet.** We must verify a safe, compatible installation route before automating multi-gigabyte downloads. The current PC described by the project owner has a GTX 750 Ti with 2 GB VRAM; ACE-Step 1.5's documented low-memory recommendation is at least 4 GB, so compatibility cannot be promised. No paid generation API is required by the design.

## Known limitations

- Not yet a replacement for FL Studio; audio scheduling and the interface still need further development and testing.
- AI full-song generation from uploaded audio requires a compatible local model service; the bridge alone does not generate music.
- VST3/plugin hosting, sample library management, automation, and a low-latency desktop audio engine remain future milestones.
- The app is currently a Vite web app. Desktop packaging and a guided installer remain future milestones.

## Development

The initial stack is React, TypeScript, and Vite. Run \`npm install\`, then \`npm run dev\`; run \`npm run build\` for the TypeScript and production build check.

# AfroStudio AI

A free-first, Windows-focused music production studio inspired by familiar DAW workflows, with Afro House tools and an AI reference-track workflow.

## Current milestone

The project is an early, actively developed desktop-capable studio foundation. Current features include:

- Playlist with draggable pattern/audio clips, transport, tempo control, and arrangement playback.
- Local browser audio playback for synthesized drum patterns, bass/melody notes, and an imported reference track.
- A first sample-based instrument browser with 12 General MIDI SoundFont presets: grand/electric piano, nylon/steel guitar, acoustic/finger/synth bass, strings, trumpet, French horn, flute, and warm pad. Presets load from the WebAudioFont-hosted FluidR3 bank on first use and are used for Piano Roll playback and WAV export when loaded.
- Channel Rack and Piano Roll editing, 32 real sample-based starter instruments (piano, electric piano, guitars, basses, strings, brass, flute and pad), searchable Instrument Rack, lightweight synth presets, starter playback effects, project save/load, and WAV arrangement export.
- Local procedural Afro House idea generation. This is not a trained AI music-generation model.
- Experimental local reference-audio analysis and an optional local Python bridge for a separately running ACE-Step API.
- Keyboard shortcuts for transport, navigation, undo/redo, duplication, save, and deleting selected items.
- An in-app Updates page that checks the latest source commit and looks for the published Windows installer. It can open the installer download, but you must close the app and run the installer manually; silent in-app replacement is not implemented.

## Windows setup status

A Windows desktop build is now being added with Electron. The Windows Installer workflow builds a setup `.exe`, bundles the local Python bridge into a standalone Windows executable, uploads a build artifact, and publishes a rolling `nightly` pre-release when the build succeeds. Installer builds are serialized so older commits do not race to overwrite the latest download. The packaged app serves its interface locally and starts the bridge automatically. The \`local-engine/setup-windows.ps1\` helper is an early setup step: it checks Python, disk space, and NVIDIA GPU information, prepares the local bridge environment, and can start the bridge.

**The helper does not install ACE-Step or download AI model weights yet.** We must verify a safe, compatible installation route before automating multi-gigabyte downloads. The current PC described by the project owner has a GTX 750 Ti with 2 GB VRAM; ACE-Step 1.5's documented low-memory recommendation is at least 4 GB, so compatibility cannot be promised. No paid generation API is required by the design.

## Known limitations

- Not yet a replacement for FL Studio; audio scheduling and the interface still need further development and testing.
- AI full-song generation from uploaded audio requires a compatible local model service; the bridge alone does not generate music.
- Native VST3 plugin hosting, deep synth design comparable to Omnisphere/Nexus, large offline sample-library downloads, automation, and a low-latency desktop audio engine remain future milestones.
- The new SoundFont instruments require internet on first load and are not yet bundled as an offline sound bank in the installer. Sound quality and WAV export still need testing on a real Windows machine. Built-in effects are currently basic playback processing, not a full vocal changer.
- The desktop installer bundles the studio interface and a standalone local bridge executable, so the bridge does not require a separate Python installation. It does not install an AI music-generation model, and the installer still needs testing on a real Windows PC.

## Try it on Windows

To get the latest Windows installer, open the [AfroStudio AI Nightly release](https://github.com/wazzapr/AfroStudio-AI/releases/tag/nightly) and download `AfroStudio-AI-Setup-0.1.0.exe`. You can also use the [Windows installer workflow](https://github.com/wazzapr/AfroStudio-AI/actions/workflows/windows-installer.yml) to see build status. If the nightly release does not exist or has no installer asset yet, wait for a successful workflow run and refresh. Run the `.exe` and follow the setup prompts. This is an early testing build; it bundles the bridge but does not install the AI model.

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

🎚️ Doctor Sample Unit (DSU)

Doctor Sample Unit is a Max for Live device by Ostin Solo, evolved from the ideas behind Split Wizard + and YouTube4Live. It’s built for producers who want to sample, separate, and reshape sound directly inside Ableton Live.

✨ Overview

DSU brings together online audio capture, AI-based stem isolation, and real-time sampling tools in one workflow. With a single interface, you can record or download material from YouTube, Deezer, and most streaming platforms, then extract up to ten independent stems using Demucs, the neural source-separation model developed by Facebook Research.

🧠 Core Features

- 🎥 Audio + Video capture from YouTube and streaming sources
- 🎧 Automatic recording of live playback directly inside Live
- 🧩 AI stem isolation (vocals, drums, bass, other — up to 10 sources) via Demucs
- ⚡ GPU acceleration with Google Colab — users can harness free cloud GPUs for faster processing
- 🎛️ Integrated Max for Live interface for monitoring progress and auditioning stems
- 💾 Local project storage — results saved automatically inside your session or Drive folder

🧩 Technology Stack

- Max for Live / Node for Max for Live integration and automation
- Python + Demucs for deep-learning stem separation
- Google Colab + Drive for optional GPU processing
- FFmpeg / yt-dlp for cross-platform media handling

⚙️ System Requirements

- Ableton Live 11 or later with Max 8
- macOS / Windows 10+
- Python 3.9+ (for local processing)
- Google Drive for Desktop (optional GPU workflow)

📖 How It Works

1. Select a YouTube link or record audio from any streaming source.
2. DSU downloads or records the file using yt-dlp and FFmpeg.
3. The file is analyzed and split into separate stems with Demucs (locally or on Colab).
4. Stems return directly to your Ableton session for remixing, sampling, and arrangement.

⚠️ Legal Notice

Doctor Sample Unit is intended for educational and personal use only. Users are responsible for ensuring they comply with copyright laws and the terms of service of any content platforms they access.

🧑‍💻 Credits

Concept & Development — Ostin Solo
Based on research by Facebook AI Research (FAIR), yt-dlp, and FFmpeg.

# Doctor Sample Unit (DSU)

Doctor Sample Unit is a Max for Live device by Ostin Solo for capturing audio, separating stems with Demucs, and sampling directly in Ableton Live.

## Overview
- Capture/download audio (YouTube and more) via yt-dlp + FFmpeg
- Separate stems with Demucs locally or on Google Colab GPU
- Integrated Max interface to submit jobs and monitor progress
- Results saved into your session or Drive folder

## Technology Stack
- Max for Live + Node for Max
- Python + Demucs
- Google Colab + Drive (optional GPU)
- FFmpeg / yt-dlp

## System Requirements
- Ableton Live 11+ with Max 8
- macOS/Windows 10+
- Python 3.9+ (for local processing)
- Google Drive for Desktop (optional GPU workflow)

## Folder Layout (Drive)
```
M4L-Demucs/
├── jobs/
│   └── audio/
└── out/
```

## Colab Quickstart
1. In Colab:
```
from google.colab import drive
drive.mount('/content/drive')
!pip -q install demucs
```
2. Copy `colab_watcher.py` to `/content/drive/MyDrive/M4L-Demucs/` and run:
```
!python /content/drive/MyDrive/M4L-Demucs/colab_watcher.py
```
3. Submit a job by writing WAV + JSON into `jobs/` on your desktop Google Drive. The watcher writes stems to `out/<jobId>/`.

## Legal
For educational/personal use only. Respect copyright and platform terms.

## Credits
- Concept & Development: Ostin Solo
- Demucs (FAIR), yt-dlp, FFmpeg

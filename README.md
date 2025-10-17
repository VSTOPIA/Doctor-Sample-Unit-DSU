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

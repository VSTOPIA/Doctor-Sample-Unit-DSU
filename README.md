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

📘 Colab Quickstart (one click)

[![Open DSU Worker in Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/VSTOPIA/Doctor-Sample-Unit-DSU/blob/main/notebooks/M4L_Demucs_Worker.ipynb)

Click the badge, Run all → the watcher mounts Drive, installs pinned versions, and starts. Drop audio into `MyDrive/M4L-Demucs/jobs/audio/`.

📘 Kaggle (GPU) Option

Open on Kaggle and Run all:
- Upload your audio to `/kaggle/working/M4L-Demucs/jobs/audio/`
- Watcher runs with `DSU_ROOT=/kaggle/working/M4L-Demucs`
- Wheels/models cached under `/kaggle/working/M4L-Demucs` (enable Persistence → Files)
- pip cache set to `/kaggle/working/M4L-Demucs/pip-cache` to avoid re-downloading
- For very large caches, attach a private Kaggle Dataset once and mount it in the notebook

[![Open in Kaggle](https://img.shields.io/badge/Open%20in-Kaggle-20BEFF?logo=kaggle&logoColor=white)](https://www.kaggle.com/kernels/welcome?src=https://raw.githubusercontent.com/VSTOPIA/Doctor-Sample-Unit-DSU/main/notebooks/Kaggle_DSU_Worker.ipynb)


## Workflows

### A) Precise by filename (recommended)
You control exactly which file runs and with what options by creating a small JSON job next to your audio.

1. Put your audio in Drive: `MyDrive/M4L-Demucs/jobs/audio/YourSong.wav`
2. Create `MyDrive/M4L-Demucs/jobs/YourSong.json` with options:
```
{
  "id": "YourSong",              // must match audio filename (without extension)
  "model": "htdemucs_ft",        // or htdemucs
  "two_stems": "vocals",         // vocals -> outputs vocals + instrumental
  "jobs": 4,                      // parallelism
  "shifts": 4,                    // quality (higher = slower)
  "segments": 0,                  // 0 for full file; set >0 to segment
  "clip_mode": "rescale"         // or "clamp"
}
```
3. Run the Watcher notebook. Results will appear in: `MyDrive/M4L-Demucs/out/YourSong/`

This method is best when you want to decide by name and manage multiple jobs.

### B) Drop‑and‑go (default)
Zero‑config is enabled by default. Just drop audio files and they are processed with defaults.

1. In Drive, create `MyDrive/M4L-Demucs/config.json`:
```
{ "zero_config": false }
```
2. Drop files into `MyDrive/M4L-Demucs/jobs/audio/`. Each file will be processed with defaults:
   - model: `htdemucs_ft`
   - two_stems: `vocals` (vocals + instrumental)
   - jobs: 4, shifts: 4, segments: 0, clip_mode: rescale
3. Results appear in `MyDrive/M4L-Demucs/out/<filename>/`

Turn it off by creating `config.json` with `{ "zero_config": false }`.

Note: This project does not bundle Google Drive. Users install Drive for Desktop and run Colab under their own Google account.

⚙️ System Requirements
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

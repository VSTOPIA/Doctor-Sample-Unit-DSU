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

### How users submit files (two options)

- Simple: Local path in Max for Live
  - If you have Google Drive for Desktop: dropping a WAV into `My Drive/M4L-Demucs/jobs/audio/` triggers processing on Colab (no credentials).
  - On Kaggle, use the DSU device’s “submit path” action (the app uploads the file to an anonymous URL and writes a job JSON; the watcher downloads and processes it).

- Without Max for Live (manual testing)
  - In the Kaggle notebook: run it (Run all). Then add a job by appending a JSON line to the repo’s `remote_jobs.jsonl` with a public `source_url`:
    - Example JSON line:
      `{ "id": "mysong1", "model": "htdemucs_ft", "two_stems": "vocals", "jobs": 4, "shifts": 4, "segments": 0, "clip_mode": "rescale", "source_url": "https://example.com/audio.wav" }`
    - The watcher fetches, separates, and writes results to `/kaggle/working/M4L-Demucs/out/<id>/`.

### Auto-return of results to your computer (no extra services)

- Start a local receiver once on your computer:
  - Terminal:
    ```bash
    node "/Users/<you>/Documents/Max 9/Max for Live Devices/DSU Project/code/local_receiver.js"
    ```
  - It listens on `http://127.0.0.1:41555/dsu-callback` and saves zips to `~/Documents/doctorsampleunit_DSU/Output`.
- When submitting a job for Kaggle, include an optional `callback_url` in the job JSON, e.g.:
  ```json
  { "id": "mysong1", "model": "htdemucs_ft", "two_stems": "vocals", "jobs": 4, "shifts": 4, "segments": 0, "clip_mode": "rescale", "source_url": "https://.../audio.wav", "callback_url": "http://127.0.0.1:41555/dsu-callback" }
  ```
- The watcher will zip results, upload to a temporary URL, and POST that link to your local receiver, which auto-downloads the zip.

### (Optional) Build a Kaggle wheels/models dataset locally

- Prereq: place your Kaggle API token at `~/.kaggle/kaggle.json` (chmod 600), and install the CLI: `pip install kaggle`.
- Assemble wheels/models locally, then run:
```bash
python tools/make_kaggle_dataset.py \
  --dataset-id vstopia/dsu-cache \
  --out ./dsu-cache \
  --wheels-cu126 /path/to/wheels_cu126 \
  --wheels-cu124 /path/to/wheels_cu124 \
  --wheels-cu121 /path/to/wheels_cu121 \
  --wheels-cu118 /path/to/wheels_cu118 \
  --models /path/to/models \
  --private --message "Initial cache"
```
- Attach the dataset in Kaggle → “Add data”, then the Worker uses it for instant cold-start installs.

### Hugging Face Space API (Demucs + Spleeter)

- Space URL: `https://vstopia-dsu.hf.space`
- Endpoint: `POST /separate` (multipart form-data). Returns `stems.zip`.
- First run on a fresh Space downloads model weights (slower). Subsequent runs are faster (cached).
- View Space logs for `[HF] /separate received …` and processing details.

Demucs — 2 stems (vocals vs instrumental):
```bash
curl -fL -X POST \
  --form 'file=@/absolute/path/to/audio.wav;type=audio/wav' \
  --form 'engine=demucs' \
  --form 'model=htdemucs_ft' \
  --form 'two_stems=vocals' \
  --form 'jobs=4' \
  --form 'shifts=0' \
  --form 'segments=0' \
  --form 'clip_mode=rescale' \
  https://vstopia-dsu.hf.space/separate \
  -o "$HOME/Documents/doctorsampleunit_DSU/Output/audio_demucs2.zip"
```

Demucs — 4 stems (vocals, drums, bass, other):
```bash
curl -fL -X POST \
  --form 'file=@/absolute/path/to/audio.wav;type=audio/wav' \
  --form 'engine=demucs' \
  --form 'model=htdemucs_ft' \
  --form 'jobs=4' \
  --form 'shifts=0' \
  --form 'segments=0' \
  --form 'clip_mode=rescale' \
  https://vstopia-dsu.hf.space/separate \
  -o "$HOME/Documents/doctorsampleunit_DSU/Output/audio_demucs4.zip"
```

Spleeter — 2/4/5 stems (5 adds piano):
```bash
curl -fL -X POST \
  --form 'file=@/absolute/path/to/audio.wav;type=audio/wav' \
  --form 'engine=spleeter' \
  --form 'spleeter_stems=5' \
  https://vstopia-dsu.hf.space/separate \
  -o "$HOME/Documents/doctorsampleunit_DSU/Output/audio_spleeter5.zip"
```

Node client (local):
```bash
node code/hf_client.js \
  --space https://vstopia-dsu.hf.space \
  --file "/absolute/path/to/audio.wav" \
  --engine demucs --model htdemucs_ft --two_stems vocals
```

#### Scale for free: let each user duplicate the Space

- One Space = one machine. To avoid contention, each user should create their own copy of the Space under their account (free CPU):
  - Duplicate link: https://huggingface.co/spaces/VSTOPIA/DSU?duplicate=true&hardware=cpu-basic&sdk=docker&title=DSU-Worker
  - Have users open the link while logged in; HF will create `username/DSU-Worker` for them.
- In DSU’s client, store one or more user Spaces and round-robin:
  ```bash
  # Add your Space URL once
  node code/hf_client.js --add-space https://<your-username>-dsu-worker.hf.space

  # List configured Spaces
  node code/hf_client.js --list-spaces

  # Submit (will use the next Space in round-robin if multiple exist)
  node code/hf_client.js \
    --file "/absolute/path/to/audio.wav" \
    --engine demucs --model htdemucs_ft --two_stems vocals
  ```
  - To target a specific Space, pass `--space https://...`.

Provision a user Space from local (no GitHub interaction):
```bash
# Option A: No token (guided browser flow)
node code/hf_space_provision.js --name DSU-Worker --hardware cpu-basic
# Follow the prompt: it opens the duplicate link; paste the new Space URL back.

# Option B: With personal HF token (non-interactive API call)
export HF_TOKEN=hf_xxx
node code/hf_space_provision.js --name DSU-Worker --hardware cpu-basic --private false --wait-secs 180
# It creates the Space via API, waits until up, and stores the URL for round-robin.
```

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

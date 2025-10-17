# DSU Colab Quickstart

## 1) Mount Google Drive
```python
from google.colab import drive
drive.mount('/content/drive')
```

## 2) Install Demucs
```python
!pip -q install demucs
```

## 3) One-shot test (2 stems: vocals + instrumental)
- Put your WAV at: `/content/drive/MyDrive/M4L-Demucs/jobs/audio/1204273.wav`
```python
import subprocess, sys, pathlib

IN_WAV = pathlib.Path('/content/drive/MyDrive/M4L-Demucs/jobs/audio/1204273.wav')
OUTDIR = pathlib.Path('/content/drive/MyDrive/M4L-Demucs/out/oneshot')
OUTDIR.mkdir(parents=True, exist_ok=True)

cmd = [
    sys.executable, "-m", "demucs.separate",
    "-n", "htdemucs_ft",
    "-o", str(OUTDIR),
    "-j", "4",
    "--shifts", "4",
    "--clip-mode", "rescale",
    "--two-stems", "vocals",
    str(IN_WAV)
]
print(" ".join(cmd))
proc = subprocess.run(cmd, capture_output=True, text=True)
print(proc.stdout)
print(proc.stderr)
```
- Stems appear in: `/content/drive/MyDrive/M4L-Demucs/out/oneshot/htdemucs_ft/<basename>/`

## 4) Watcher mode (Drive round-trip)
- Ensure this file exists in Drive: `/content/drive/MyDrive/M4L-Demucs/colab_watcher.py`
- Start watcher:
```python
!python /content/drive/MyDrive/M4L-Demucs/colab_watcher.py
```
- Leave it running. It writes `heartbeat.json`, watches `jobs/*.json`, runs Demucs, and writes `out/<jobId>/`.

## Notes
- If you see timeouts, just rerun the watcher cell; the jobs folder persists.
- For progress, inspect `out/<jobId>/status.json` while running.

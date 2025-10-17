import json, time, pathlib, threading, datetime, subprocess, traceback, os, sys
import shutil

ROOT = pathlib.Path('/content/drive/MyDrive/M4L-Demucs')
SITE = ROOT / '.venv' / 'site-packages'
MODEL_CACHE = ROOT / 'model-cache'
os.environ.setdefault('XDG_CACHE_HOME', str(MODEL_CACHE))
os.environ.setdefault('DEMUCS_CACHE', str(MODEL_CACHE))
if SITE.exists():
    if str(SITE) not in sys.path:
        sys.path.insert(0, str(SITE))
JOBS = ROOT / 'jobs'
AUDIO = JOBS / 'audio'
OUT   = ROOT / 'out'
CONFIG = ROOT / 'config.json'

for p in [ROOT, JOBS, AUDIO, OUT]:
    p.mkdir(parents=True, exist_ok=True)

HEARTBEAT = ROOT / 'heartbeat.json'

def beat():
    while True:
        try:
            HEARTBEAT.write_text(json.dumps({
                'alive': True,
                'ts': datetime.datetime.now(datetime.timezone.utc).isoformat()
            }))
        except Exception:
            pass
        time.sleep(5)

def write_status(job_id, **kw):
    sd = OUT / job_id
    sd.mkdir(parents=True, exist_ok=True)
    (sd / 'status.json').write_text(json.dumps(kw))

def run_demucs(in_wav, out_dir, model='htdemucs', two_stems='', jobs=2, shifts=0, segments=0, clip_mode='rescale'):
    # Force CUDA device on Colab GPU runtimes for best performance
    cmd = [sys.executable, '-m', 'demucs.separate', '-n', model, '-d', 'cuda', '-o', str(out_dir)]
    if two_stems:
        cmd += ['--two-stems', two_stems]
    if isinstance(jobs, int) and jobs > 0:
        cmd += ['-j', str(jobs)]
    if isinstance(shifts, int) and shifts > 0:
        cmd += ['--shifts', str(shifts)]
    if isinstance(segments, (int, float)) and segments:
        cmd += ['--segment', str(segments)]
    if clip_mode in ('rescale', 'clamp'):
        cmd += ['--clip-mode', clip_mode]
    cmd.append(str(in_wav))

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    last_line = ''
    for line in proc.stdout:
        line = line.rstrip('\n')
        if line:
            last_line = line
        if 'Separating' in line:
            phase = 'separate'
        elif 'Loaded' in line or 'Using' in line:
            phase = 'prepare'
        elif 'done' in line.lower():
            phase = 'finalize'
        else:
            phase = 'run'
        yield phase, line
    proc.wait()
    if proc.returncode != 0:
        # Surface the last log line to upper layers for status.json
        raise RuntimeError(f'Demucs failed: {last_line}')

def process_job(job_path: pathlib.Path):
    job = json.loads(job_path.read_text())
    jid = job['id']
    in_wav = AUDIO / f'{jid}.wav'
    stem_dir = OUT / jid

    print(f"[Watcher] QUEUED job {jid}")
    write_status(jid, status='queued')
    try:
        print(f"[Watcher] RUN job {jid} using model={job.get('model','htdemucs')} two_stems={job.get('two_stems','')} jobs={job.get('jobs',2)}")
        write_status(jid, status='running', phase='prepare')
        for phase, logline in run_demucs(
            in_wav,
            stem_dir,
            model=job.get('model', 'htdemucs'),
            two_stems=job.get('two_stems', ''),
            jobs=int(job.get('jobs', 2)),
            shifts=int(job.get('shifts', 0)),
            segments=float(job.get('segments', 0) or 0),
            clip_mode=job.get('clip_mode', 'rescale'),
        ):
            write_status(jid, status='running', phase=phase, log=logline)
        # Flatten Demucs output: copy stems from separated/<model>/<jid>/ into out/<jid>/
        try:
            model = job.get('model', 'htdemucs')
            src_dir = stem_dir / 'separated' / model / jid
            if src_dir.exists():
                for name in os.listdir(src_dir):
                    src = src_dir / name
                    if src.is_file():
                        shutil.copy2(src, stem_dir / name)
        except Exception as _e:
            pass
        (stem_dir / 'done.json').write_text(json.dumps({'status': 'done'}))
        print(f"[Watcher] DONE job {jid}")
        write_status(jid, status='done', phase='complete')
    except Exception as e:
        err = f'{type(e).__name__}: {e}'
        (stem_dir / 'done.json').write_text(json.dumps({'status': 'error', 'error': err}))
        print(f"[Watcher] ERROR job {jid}: {err}")
        write_status(jid, status='error', error=err, trace=traceback.format_exc())

def process_audio_file(audio_path: pathlib.Path):
    """Zero-config path: process a dropped audio file with defaults.
    Job id = filename stem. Writes status/done files into out/<id>/.
    """
    jid = audio_path.stem
    stem_dir = OUT / jid
    print(f"[Watcher] QUEUED file {audio_path.name}")
    write_status(jid, status='queued')
    try:
        # Defaults: quality-focused, 2 stems (vocals + instrumental)
        defaults = {
            'model': 'htdemucs_ft',
            'two_stems': 'vocals',
            'jobs': 4,
            'shifts': 4,
            'segments': 0,
            'clip_mode': 'rescale',
        }
        print(f"[Watcher] RUN file {audio_path.name} model={defaults['model']} two_stems={defaults['two_stems']} jobs={defaults['jobs']}")
        write_status(jid, status='running', phase='prepare')
        for phase, logline in run_demucs(
            audio_path,
            stem_dir,
            model=defaults['model'],
            two_stems=defaults['two_stems'],
            jobs=defaults['jobs'],
            shifts=defaults['shifts'],
            segments=defaults['segments'],
            clip_mode=defaults['clip_mode'],
        ):
            write_status(jid, status='running', phase=phase, log=logline)
        # Flatten Demucs output into out/<jid>/
        try:
            src_dir = stem_dir / 'separated' / defaults['model'] / jid
            if src_dir.exists():
                for name in os.listdir(src_dir):
                    src = src_dir / name
                    if src.is_file():
                        shutil.copy2(src, stem_dir / name)
        except Exception as _e:
            pass
        (stem_dir / 'done.json').write_text(json.dumps({'status': 'done'}))
        print(f"[Watcher] DONE file {audio_path.name}")
        write_status(jid, status='done', phase='complete')
    except Exception as e:
        err = f'{type(e).__name__}: {e}'
        (stem_dir / 'done.json').write_text(json.dumps({'status': 'error', 'error': err}))
        print(f"[Watcher] ERROR file {audio_path.name}: {err}")
        write_status(jid, status='error', error=err, trace=traceback.format_exc())

def watch_loop():
    print(f'Watching {JOBS} ...')
    while True:
        try:
            # Read config (zero-config default enabled for simplicity)
            zero_config = True
            try:
                if CONFIG.exists():
                    cfg = json.loads(CONFIG.read_text() or '{}')
                    zero_config = bool(cfg.get('zero_config', False))
            except Exception:
                zero_config = True

            # 1) Process explicit JSON jobs
            for job_json in sorted(JOBS.glob('*.json')):
                jid = job_json.stem
                stem_dir = OUT / jid
                if (stem_dir / 'done.json').exists():
                    continue
                process_job(job_json)
                # optional: remove job_json after processing
                # job_json.unlink(missing_ok=True)

            # 2) Optional zero-config: process any new audio dropped without JSON
            if zero_config:
                for audio_path in sorted(AUDIO.glob('*')):
                    if not audio_path.is_file():
                        continue
                    if audio_path.suffix.lower() not in {'.wav', '.flac', '.mp3', '.m4a', '.ogg'}:
                        continue
                    jid = audio_path.stem
                    stem_dir = OUT / jid
                    # Skip if already processed
                    if (stem_dir / 'done.json').exists():
                        continue
                    # Skip if a JSON job exists for this id
                    if (JOBS / f'{jid}.json').exists():
                        continue
                    process_audio_file(audio_path)
        except Exception as e:
            print('Watcher error:', e)
        time.sleep(2)

def main():
    threading.Thread(target=beat, daemon=True).start()
    watch_loop()

if __name__ == '__main__':
    main()



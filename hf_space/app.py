import io
import os
import shutil
import tempfile
import zipfile
import pathlib
import subprocess
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse

app = FastAPI()


@app.get("/")
def root():
    return {"dsu": "ok", "device": "cpu"}


def run_demucs(inp: pathlib.Path, out_dir: pathlib.Path, model: str, two_stems: str,
               jobs: int, shifts: int, segments: float, clip_mode: str) -> None:
    cmd = [
        "python", "-m", "demucs.separate",
        "-n", model or "htdemucs",
        "-d", "cpu",
        "-o", str(out_dir)
    ]
    if two_stems:
        cmd += ["--two-stems", two_stems]
    if jobs and jobs > 0:
        cmd += ["-j", str(int(jobs))]
    if shifts and shifts > 0:
        cmd += ["--shifts", str(int(shifts))]
    if segments and float(segments) > 0:
        cmd += ["--segment", str(float(segments))]
    if clip_mode in ("rescale", "clamp"):
        cmd += ["--clip-mode", clip_mode]
    cmd += [str(inp)]
    subprocess.run(cmd, check=True)


def run_spleeter(inp: pathlib.Path, out_dir: pathlib.Path, stems: int) -> None:
    # stems: 2, 4, or 5 (5 includes piano)
    preset = f"spleeter:{int(stems)}stems"
    cmd = [
        "spleeter", "separate",
        "-p", preset,
        "-o", str(out_dir),
        str(inp)
    ]
    subprocess.run(cmd, check=True)


def zip_dir(src_dir: pathlib.Path, dst_zip: pathlib.Path) -> None:
    with zipfile.ZipFile(dst_zip, "w", zipfile.ZIP_DEFLATED) as z:
        for p in src_dir.rglob("*"):
            if p.is_file():
                z.write(p, arcname=p.relative_to(src_dir))


@app.post("/separate")
def separate(
    file: UploadFile = File(...),
    engine: str = Form("demucs"),              # demucs | spleeter
    model: str = Form("htdemucs"),             # demucs model (e.g., htdemucs, htdemucs_ft, htdemucs_6s)
    two_stems: str = Form(""),                 # vocals | drums | bass | other
    jobs: int = Form(1),
    shifts: int = Form(0),
    segments: float = Form(0),
    clip_mode: str = Form("rescale"),
    spleeter_stems: int = Form(5)               # 2 | 4 | 5 (5 adds piano)
):
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="dsu_"))
    try:
        inp = tmp / (file.filename or "audio.wav")
        with open(inp, "wb") as f:
            shutil.copyfileobj(file.file, f)

        out_root = tmp / "out"
        out_root.mkdir(parents=True, exist_ok=True)

        if engine == "spleeter":
            run_spleeter(inp, out_root, spleeter_stems)
            # Spleeter writes out_root/<name>/
            # Zip that folder
            first = next(out_root.iterdir())
            zip_path = tmp / "stems.zip"
            zip_dir(first, zip_path)
        else:
            run_demucs(inp, out_root, model, two_stems, jobs, shifts, segments, clip_mode)
            # Demucs writes separated/<model>/<name>/ under out_root
            sep = out_root / "separated"
            # Find the deepest leaf containing files
            leaf = None
            if sep.exists():
                for p in sep.rglob("*"):
                    if p.is_dir() and any(x.is_file() for x in p.iterdir()):
                        leaf = p
            if leaf is None:
                return JSONResponse({"error": "no stems found"}, status_code=500)
            zip_path = tmp / "stems.zip"
            zip_dir(leaf, zip_path)

        return FileResponse(str(zip_path), media_type="application/zip", filename="stems.zip")
    except subprocess.CalledProcessError as e:
        return JSONResponse({"error": f"separation failed: {e}"}, status_code=500)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        try:
            file.file.close()
        except Exception:
            pass



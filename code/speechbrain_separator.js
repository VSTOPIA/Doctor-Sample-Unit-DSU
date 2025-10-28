#!/usr/bin/env node
/**
 * speechbrain_separator.js
 * Node.js wrapper for SpeechBrain speaker separation and diarization
 * Usage: node speechbrain_separator.js <input_file> <output_dir> [options]
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const VENV_DIR = path.join(__dirname, '../.venv_speechbrain');
const VENV_PYTHON = path.join(VENV_DIR, 'bin/python');

// Check if virtual environment exists
function checkVenv() {
  return fs.existsSync(VENV_PYTHON);
}

// Check if SpeechBrain is installed in venv
function checkSpeechBrain() {
  if (!checkVenv()) {
    return Promise.resolve(false);
  }
  
  return new Promise((resolve) => {
    const check = spawn(VENV_PYTHON, ['-c', 'import speechbrain'], { shell: false });
    check.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

// Setup virtual environment and install SpeechBrain
function setupEnvironment() {
  console.log('[SpeechBrain] Setting up isolated Python environment...');
  console.log('[SpeechBrain] This is a one-time setup and may take a few minutes.');
  
  return new Promise((resolve, reject) => {
    const setupScript = path.join(__dirname, '../tools/setup_speechbrain_env.sh');
    
    if (!fs.existsSync(setupScript)) {
      reject(new Error('Setup script not found. Please ensure tools/setup_speechbrain_env.sh exists.'));
      return;
    }
    
    const setup = spawn('bash', [setupScript], { 
      shell: false,
      stdio: 'inherit'
    });
    
    setup.on('close', (code) => {
      if (code === 0) {
        console.log('[SpeechBrain] Environment setup complete!');
        resolve();
      } else {
        reject(new Error('Failed to setup SpeechBrain environment'));
      }
    });
  });
}

// Separate speakers using SpeechBrain
async function separateSpeakers(inputPath, outputDir, options = {}) {
  // Check if SpeechBrain environment is set up
  const isInstalled = await checkSpeechBrain();
  if (!isInstalled) {
    await setupEnvironment();
  }

  // Validate input file
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Create Python script for separation
  const pythonScript = `
import sys
import os
import torch
import torchaudio
from speechbrain.inference.separation import SepformerSeparation as separator

input_path = str(sys.argv[1])  # Convert to string to avoid Path type issues
output_dir = str(sys.argv[2])
device = sys.argv[3] if len(sys.argv) > 3 else 'cpu'

print(f"[SpeechBrain] Loading model...")
# Use pre-trained Sepformer model from HuggingFace
model = separator.from_hparams(
    source="speechbrain/sepformer-whamr",
    savedir="pretrained_models/sepformer-whamr",
    run_opts={"device": device}
)

print(f"[SpeechBrain] Processing: {input_path}")
print(f"[SpeechBrain] Device: {device}")

# Load audio manually to avoid Path type issues
waveform, sample_rate = torchaudio.load(input_path)
print(f"[SpeechBrain] Loaded audio: {waveform.shape}, sample_rate: {sample_rate}")

# Convert stereo to mono if needed
if waveform.shape[0] > 1:
    waveform = torch.mean(waveform, dim=0, keepdim=True)
    print(f"[SpeechBrain] Converted to mono: {waveform.shape}")

# Resample to 8kHz if needed (model expects 8kHz)
if sample_rate != 8000:
    resampler = torchaudio.transforms.Resample(sample_rate, 8000)
    waveform = resampler(waveform)
    print(f"[SpeechBrain] Resampled to 8kHz: {waveform.shape}")
    sample_rate = 8000

# Separate speakers - waveform should be [channels, time]
est_sources = model.separate_batch(waveform)

print(f"[SpeechBrain] Output shape: {est_sources.shape}")

# est_sources is [batch, time, sources] - we need to transpose
# to get [batch, sources, time]
if len(est_sources.shape) == 3:
    est_sources = est_sources.permute(0, 2, 1)
    num_sources = est_sources.shape[1]
else:
    num_sources = 1

print(f"[SpeechBrain] Separated {num_sources} sources")

# Save separated sources
for i in range(num_sources):
    output_path = os.path.join(output_dir, f"speaker_{i+1}.wav")
    # est_sources is now [batch, sources, time], extract [channels, time]
    torchaudio.save(output_path, est_sources[0, i, :].unsqueeze(0).cpu(), sample_rate)
    print(f"[SpeechBrain] Saved: {output_path}")

print("[SpeechBrain] Done!")
`;

  const scriptPath = path.join(outputDir, '_separate.py');
  fs.writeFileSync(scriptPath, pythonScript);

  const device = options.device || 'cpu';
  const args = [scriptPath, inputPath, outputDir, device];

  console.log('[SpeechBrain] Running separation...');
  console.log('[SpeechBrain] Input:', inputPath);
  console.log('[SpeechBrain] Output:', outputDir);
  console.log('[SpeechBrain] Device:', device);
  console.log('[SpeechBrain] Using venv:', VENV_PYTHON);

  return new Promise((resolve, reject) => {
    const proc = spawn(VENV_PYTHON, args, { 
      shell: false,
      stdio: 'inherit'
    });

    proc.on('close', (code) => {
      // Clean up script
      try {
        fs.unlinkSync(scriptPath);
      } catch (e) {}

      if (code === 0) {
        console.log(`[SpeechBrain] Success! Separated speakers saved to: ${outputDir}`);
        
        // List output files
        const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.wav'));
        console.log(`[SpeechBrain] Generated ${files.length} speaker files:`);
        files.forEach(f => console.log(`  - ${f}`));
        
        resolve(outputDir);
      } else {
        reject(new Error(`SpeechBrain exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      try {
        fs.unlinkSync(scriptPath);
      } catch (e) {}
      reject(err);
    });
  });
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`
Usage: node speechbrain_separator.js <input_file> <output_dir> [options]

Options:
  --device <device>      Device to use (cpu, cuda, mps) - default: cpu

Examples:
  node speechbrain_separator.js interview.wav output/
  node speechbrain_separator.js interview.wav output/ --device cuda
  node speechbrain_separator.js podcast.wav speakers/ --device mps

Note: SpeechBrain uses pre-trained Sepformer models from HuggingFace.
Output files will be named: speaker_1.wav, speaker_2.wav, etc.
`);
    process.exit(1);
  }

  const inputPath = args[0];
  const outputDir = args[1];
  const options = {};

  // Parse arguments
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--device') {
      options.device = args[i + 1];
      i++;
    }
  }

  separateSpeakers(inputPath, outputDir, options)
    .then((output) => {
      console.log(`[SpeechBrain] Done: ${output}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[SpeechBrain] Error: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { separateSpeakers, checkSpeechBrain, setupEnvironment };


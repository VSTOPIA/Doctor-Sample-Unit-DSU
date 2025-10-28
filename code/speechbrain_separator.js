#!/usr/bin/env node
/**
 * speechbrain_separator.js
 * Node.js wrapper for SpeechBrain speaker separation and diarization
 * Usage: node speechbrain_separator.js <input_file> <output_dir> [options]
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Check if SpeechBrain is installed
function checkSpeechBrain() {
  return new Promise((resolve) => {
    const check = spawn('python3', ['-c', 'import speechbrain'], { shell: true });
    check.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

// Install SpeechBrain
function installSpeechBrain() {
  console.log('[SpeechBrain] Installing SpeechBrain...');
  return new Promise((resolve, reject) => {
    const install = spawn('pip3', ['install', 'speechbrain'], { 
      shell: true,
      stdio: 'inherit'
    });
    install.on('close', (code) => {
      if (code === 0) {
        console.log('[SpeechBrain] SpeechBrain installed successfully');
        resolve();
      } else {
        reject(new Error('Failed to install SpeechBrain'));
      }
    });
  });
}

// Separate speakers using SpeechBrain
async function separateSpeakers(inputPath, outputDir, options = {}) {
  // Check if SpeechBrain is installed
  const isInstalled = await checkSpeechBrain();
  if (!isInstalled) {
    console.log('[SpeechBrain] Installing SpeechBrain...');
    await installSpeechBrain();
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

input_path = sys.argv[1]
output_dir = sys.argv[2]
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

# Separate speakers
est_sources = model.separate_file(path=input_path)

print(f"[SpeechBrain] Separated {est_sources.shape[1]} sources")

# Save separated sources
for i in range(est_sources.shape[1]):
    output_path = os.path.join(output_dir, f"speaker_{i+1}.wav")
    torchaudio.save(output_path, est_sources[:, i, :].cpu(), 8000)
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

  return new Promise((resolve, reject) => {
    const proc = spawn('python3', args, { 
      shell: true,
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

module.exports = { separateSpeakers, checkSpeechBrain, installSpeechBrain };


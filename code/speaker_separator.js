#!/usr/bin/env node
/**
 * speaker_separator.js
 * Node.js wrapper for SVoice (Facebook Research) to separate multiple speakers
 * Usage: node speaker_separator.js <input_file> <output_dir> [options]
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SVOICE_PATH = path.join(__dirname, '../../_build/svoice');
const MODEL_URL = 'https://dl.fbaipublicfiles.com/svoice/models/svoice_best.th';

// Check if SVoice is installed
function checkSVoice() {
  return fs.existsSync(SVOICE_PATH) && fs.existsSync(path.join(SVOICE_PATH, 'svoice'));
}

// Install SVoice dependencies
function installSVoice() {
  console.log('[Speaker Separator] Installing SVoice dependencies...');
  return new Promise((resolve, reject) => {
    const install = spawn('pip3', ['install', '-r', path.join(SVOICE_PATH, 'requirements.txt')], { 
      shell: true,
      stdio: 'inherit',
      cwd: SVOICE_PATH
    });
    install.on('close', (code) => {
      if (code === 0) {
        console.log('[Speaker Separator] SVoice dependencies installed successfully');
        resolve();
      } else {
        reject(new Error('Failed to install SVoice dependencies'));
      }
    });
  });
}

// Download pre-trained model
function downloadModel(modelPath) {
  console.log('[Speaker Separator] Downloading pre-trained model...');
  return new Promise((resolve, reject) => {
    const download = spawn('curl', ['-fL', '-o', modelPath, MODEL_URL], {
      shell: true,
      stdio: 'inherit'
    });
    download.on('close', (code) => {
      if (code === 0) {
        console.log('[Speaker Separator] Model downloaded successfully');
        resolve();
      } else {
        reject(new Error('Failed to download model'));
      }
    });
  });
}

// Separate speakers from audio file
async function separateSpeakers(inputPath, outputDir, options = {}) {
  // Check if SVoice is installed
  if (!checkSVoice()) {
    throw new Error('SVoice not found. Please clone it first: git clone https://github.com/facebookresearch/svoice.git _build/svoice');
  }

  // Validate input file
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Check if model exists
  const modelPath = options.modelPath || path.join(SVOICE_PATH, 'svoice_best.th');
  if (!fs.existsSync(modelPath)) {
    console.log('[Speaker Separator] Pre-trained model not found, downloading...');
    await downloadModel(modelPath);
  }

  // Install dependencies if needed
  try {
    require.resolve('torch');
  } catch (e) {
    console.log('[Speaker Separator] Installing dependencies...');
    await installSVoice();
  }

  // Create a temporary directory with the input file
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svoice-'));
  const tempInput = path.join(tempDir, path.basename(inputPath));
  fs.copyFileSync(inputPath, tempInput);

  // Build SVoice command
  const args = [
    '-m', 'svoice.separate',
    modelPath,
    outputDir,
    '--mix_dir', tempDir
  ];

  if (options.device) {
    args.push('--device', options.device); // e.g., 'cuda', 'cpu', 'mps'
  }
  if (options.sampleRate) {
    args.push('--sample_rate', options.sampleRate);
  }
  if (options.batchSize) {
    args.push('--batch_size', options.batchSize);
  }

  console.log('[Speaker Separator] Running:', 'python3', args.join(' '));
  console.log('[Speaker Separator] Input:', inputPath);
  console.log('[Speaker Separator] Output:', outputDir);

  return new Promise((resolve, reject) => {
    const proc = spawn('python3', args, { 
      shell: true,
      stdio: 'inherit',
      cwd: SVOICE_PATH
    });

    proc.on('close', (code) => {
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });

      if (code === 0) {
        console.log(`[Speaker Separator] Success! Separated speakers saved to: ${outputDir}`);
        
        // List output files
        const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.wav'));
        console.log(`[Speaker Separator] Generated ${files.length} speaker files:`);
        files.forEach(f => console.log(`  - ${f}`));
        
        resolve(outputDir);
      } else {
        reject(new Error(`SVoice exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
      reject(err);
    });
  });
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`
Usage: node speaker_separator.js <input_file> <output_dir> [options]

Options:
  --model-path <path>    Path to pre-trained model (default: auto-download)
  --device <device>      Device to use (cpu, cuda, mps)
  --sample-rate <rate>   Sample rate (default: 8000)
  --batch-size <size>    Batch size (default: 1)

Examples:
  node speaker_separator.js interview.wav output/
  node speaker_separator.js interview.wav output/ --device mps
  node speaker_separator.js interview.wav output/ --model-path models/custom.th

Note: SVoice separates 2-5 speakers automatically. Output files will be named:
  - s1.wav (speaker 1)
  - s2.wav (speaker 2)
  - ... (additional speakers if detected)
`);
    process.exit(1);
  }

  const inputPath = args[0];
  const outputDir = args[1];
  const options = {};

  // Parse arguments
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      options[key] = args[i + 1];
      i++;
    }
  }

  separateSpeakers(inputPath, outputDir, options)
    .then((output) => {
      console.log(`[Speaker Separator] Done: ${output}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[Speaker Separator] Error: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { separateSpeakers, checkSVoice, installSVoice };


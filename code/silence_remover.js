#!/usr/bin/env node
/**
 * silence_remover.js
 * Node.js wrapper for auto-editor to remove silence from audio/video files
 * Usage: node silence_remover.js <input_file> [output_file] [options]
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Check if auto-editor is installed
function checkAutoEditor() {
  return new Promise((resolve) => {
    const check = spawn('auto-editor', ['--version'], { shell: true });
    check.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

// Install auto-editor via pip3
function installAutoEditor() {
  console.log('[Silence Remover] Installing auto-editor via pip3...');
  return new Promise((resolve, reject) => {
    const install = spawn('pip3', ['install', 'auto-editor'], { 
      shell: true,
      stdio: 'inherit'
    });
    install.on('close', (code) => {
      if (code === 0) {
        console.log('[Silence Remover] auto-editor installed successfully');
        resolve();
      } else {
        reject(new Error('Failed to install auto-editor'));
      }
    });
  });
}

// Remove silence from audio/video file
async function removeSilence(inputPath, outputPath = null, options = {}) {
  // Check if auto-editor is installed
  const isInstalled = await checkAutoEditor();
  if (!isInstalled) {
    console.log('[Silence Remover] auto-editor not found, installing...');
    await installAutoEditor();
  }

  // Validate input file
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  // Generate output path if not provided
  if (!outputPath) {
    const parsed = path.parse(inputPath);
    outputPath = path.join(parsed.dir, `${parsed.name}_no_silence${parsed.ext}`);
  }

  // Build auto-editor command
  const args = [inputPath];
  
  // Add options
  if (options.margin) {
    args.push('--margin', options.margin); // e.g., "0.1s" or "3"
  }
  if (options.edit) {
    args.push('--edit', options.edit); // e.g., "audio:threshold=0.03"
  }
  if (options.whenSilent) {
    args.push('--when-silent', options.whenSilent); // e.g., "skip" (default)
  }
  if (options.whenNormal) {
    args.push('--when-normal', options.whenNormal); // e.g., "keep" (default)
  }
  
  args.push('--no-open'); // Don't open the file after processing
  args.push('-o', outputPath);

  console.log('[Silence Remover] Running:', 'auto-editor', args.join(' '));

  return new Promise((resolve, reject) => {
    const proc = spawn('auto-editor', args, { 
      shell: true,
      stdio: 'inherit'
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`[Silence Remover] Success! Output: ${outputPath}`);
        resolve(outputPath);
      } else {
        reject(new Error(`auto-editor exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage: node silence_remover.js <input_file> [output_file] [options]

Options:
  --margin <value>       Margin around non-silent sections (e.g., "0.1s" or "3" frames)
  --edit <value>         Edit method expression (e.g., "audio:threshold=0.03")
  --when-silent <value>  Action for silent sections (e.g., "skip", "mute")
  --when-normal <value>  Action for normal sections (e.g., "keep")

Examples:
  node silence_remover.js input.wav
  node silence_remover.js input.wav output.wav
  node silence_remover.js input.wav output.wav --margin 0.1s --edit "audio:threshold=0.03"
`);
    process.exit(1);
  }

  const inputPath = args[0];
  let outputPath = null;
  const options = {};

  // Parse arguments
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      options[key] = args[i + 1];
      i++;
    } else if (!outputPath) {
      outputPath = arg;
    }
  }

  removeSilence(inputPath, outputPath, options)
    .then((output) => {
      console.log(`[Silence Remover] Done: ${output}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[Silence Remover] Error: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { removeSilence, checkAutoEditor, installAutoEditor };


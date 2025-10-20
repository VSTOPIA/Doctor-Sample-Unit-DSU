#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

function usage() {
  console.error('Usage: submit_remote_job.js <absolute-audio-path> [--model htdemucs_ft] [--two-stems vocals] [--jobs 4] [--shifts 4] [--segments 0] [--clip-mode rescale]')
  process.exit(2)
}

const args = process.argv.slice(2)
if (!args[0] || !path.isAbsolute(args[0])) usage()
const audioPath = args[0]
if (!fs.existsSync(audioPath)) {
  console.error('File not found:', audioPath)
  process.exit(1)
}

function getArg(flag, def) {
  const i = args.indexOf(flag)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def
}

const model = getArg('--model', 'htdemucs_ft')
const twoStems = getArg('--two-stems', 'vocals')
const jobs = parseInt(getArg('--jobs', '4'), 10)
const shifts = parseInt(getArg('--shifts', '4'), 10)
const segments = parseFloat(getArg('--segments', '0'))
const clipMode = getArg('--clip-mode', 'rescale')

const filename = path.basename(audioPath)
const id = path.parse(filename).name

function tryUpload(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() } catch { return '' }
}

let url = ''
// Try transfer.sh then fallback to file.io
url = tryUpload(`curl --silent --show-error --upload-file "${audioPath}" https://transfer.sh/${filename}`)
if (!/^https?:\/\//.test(url)) {
  const out = tryUpload(`curl -s -F "file=@${audioPath}" https://file.io`)
  try { url = JSON.parse(out).link || '' } catch { url = '' }
}
if (!/^https?:\/\//.test(url)) {
  console.error('Upload failed (transfer.sh and file.io).')
  process.exit(1)
}

const job = {
  id,
  model,
  two_stems: twoStems,
  jobs,
  shifts,
  segments,
  clip_mode: clipMode,
  source_url: url,
}

const repoRoot = path.resolve(__dirname, '..')
const feedPath = path.join(repoRoot, 'remote_jobs.jsonl')
fs.appendFileSync(feedPath, JSON.stringify(job) + '\n', 'utf8')
console.log('Appended remote job:', job)
console.log('URL:', url)


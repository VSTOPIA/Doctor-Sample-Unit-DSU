#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const os = require('os')
const axios = require('axios')
const FormData = require('form-data')

const CONFIG_DIR = path.join(os.homedir(), 'Documents', 'doctorsampleunit_DSU')
const CONFIG_PATH = path.join(CONFIG_DIR, 'hf_spaces.json')

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return { spaces: [], rrIndex: 0 }
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } catch { return { spaces: [], rrIndex: 0 } }
}
function saveConfig(cfg) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
}

function normalizeSpaceUrl(url) {
  if (!url) return ''
  return url.replace(/\/+$/, '')
}

async function submitToHF({ inputPath, spaceUrl, token, outDir, jobId }) {
  if (!fs.existsSync(inputPath)) throw new Error('inputPath not found')
  const endpointBase = normalizeSpaceUrl(spaceUrl)
  if (!endpointBase) throw new Error('spaceUrl required')
  const endpoint = endpointBase + '/separate'
  const id = jobId || path.parse(inputPath).name
  const out = outDir || path.join(os.homedir(), 'Documents', 'doctorsampleunit_DSU', 'Output')
  fs.mkdirSync(out, { recursive: true })

  const form = new FormData()
  form.append('file', fs.createReadStream(inputPath))

  const headers = { ...form.getHeaders() }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const resp = await axios.post(endpoint, form, { responseType: 'arraybuffer', headers, validateStatus: s => s < 500 })

  const ctype = String(resp.headers['content-type'] || '')
  if (resp.status === 200 && ctype.includes('application/zip')) {
    const zipPath = path.join(out, `${id}.zip`)
    fs.writeFileSync(zipPath, Buffer.from(resp.data))
    return { id, zipPath, spaceUrl: endpointBase }
  }

  try {
    const text = Buffer.from(resp.data).toString('utf8')
    const j = JSON.parse(text)
    if (j.download_url) {
      const z = await axios.get(j.download_url, { responseType: 'arraybuffer' })
      const zipPath = path.join(out, `${id}.zip`)
      fs.writeFileSync(zipPath, Buffer.from(z.data))
      return { id, zipPath, downloadUrl: j.download_url, spaceUrl: endpointBase }
    }
    throw new Error(`Unexpected response: ${resp.status} ${text}`)
  } catch (e) {
    throw new Error(`HF Space error: HTTP ${resp.status}`)
  }
}

function pickSpaceUrl(preferred) {
  const cfg = loadConfig()
  const list = cfg.spaces || []
  if (preferred) return preferred
  if (list.length === 0) throw new Error('No Space configured. Use --add-space <url> first or pass --space <url>.')
  const idx = cfg.rrIndex || 0
  const url = list[idx % list.length]
  cfg.rrIndex = (idx + 1) % Math.max(1, list.length)
  saveConfig(cfg)
  return url
}

function addSpaceUrl(url) {
  const cfg = loadConfig()
  const u = normalizeSpaceUrl(url)
  if (!u) throw new Error('space url required')
  if (!cfg.spaces.includes(u)) cfg.spaces.push(u)
  saveConfig(cfg)
  return cfg.spaces
}

function listSpaces() {
  const cfg = loadConfig()
  return cfg.spaces || []
}

// CLI
// Examples:
//  node hf_client.js --space https://user-space.hf.space --file /abs/path.wav --engine demucs --model htdemucs_ft --two_stems vocals
//  node hf_client.js --add-space https://user-space.hf.space
//  node hf_client.js --list-spaces

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    const next = i + 1 < argv.length ? argv[i + 1] : undefined
    switch (a) {
      case '--file': args.file = next; i++; break
      case '--space': args.space = next; i++; break
      case '--token': args.token = next; i++; break
      case '--engine': args.engine = next; i++; break
      case '--model': args.model = next; i++; break
      case '--two_stems': args.two_stems = next; i++; break
      case '--jobs': args.jobs = next; i++; break
      case '--shifts': args.shifts = next; i++; break
      case '--segments': args.segments = next; i++; break
      case '--clip_mode': args.clip_mode = next; i++; break
      case '--out': args.out = next; i++; break
      case '--add-space': args.addSpace = next; i++; break
      case '--list-spaces': args.listSpaces = true; break
      default: break
    }
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.listSpaces) {
    console.log(JSON.stringify({ spaces: listSpaces() }, null, 2))
    return
  }
  if (args.addSpace) {
    const spaces = addSpaceUrl(args.addSpace)
    console.log(JSON.stringify({ added: args.addSpace, spaces }, null, 2))
    return
  }
  const inputPath = args.file
  if (!inputPath) throw new Error('missing --file')
  const spaceUrl = pickSpaceUrl(args.space)
  const r = await submitToHF({ inputPath, spaceUrl, token: args.token, outDir: args.out })
  console.log(JSON.stringify(r))
}

if (require.main === module) {
  main().catch(e => { console.error('ERROR', e.message); process.exit(1) })
}

module.exports = { submitToHF, addSpaceUrl, listSpaces, loadConfig, saveConfig }



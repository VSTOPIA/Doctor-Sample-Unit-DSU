#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const axios = require('axios')
const { exec } = require('child_process')

const { addSpaceUrl } = require('./hf_client')

const HF_API = 'https://huggingface.co/api/spaces'
const TEMPLATE = 'VSTOPIA/DSU'

function readToken(cliToken) {
  if (cliToken) return cliToken
  if (process.env.HF_TOKEN) return process.env.HF_TOKEN
  const p = path.join(os.homedir(), '.hf_token')
  if (fs.existsSync(p)) {
    return fs.readFileSync(p, 'utf8').trim()
  }
  return ''
}

function openInBrowser(url) {
  const plat = process.platform
  const cmd = plat === 'darwin' ? `open "${url}"` : plat === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`
  exec(cmd)
}

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    const next = i + 1 < argv.length ? argv[i + 1] : undefined
    switch (a) {
      case '--token': args.token = next; i++; break
      case '--name': args.name = next; i++; break
      case '--private': args.private = next === 'true'; i++; break
      case '--hardware': args.hardware = next; i++; break
      case '--wait-secs': args.waitSecs = parseInt(next || '180', 10); i++; break
      default: break
    }
  }
  return args
}

async function createByAPI({ token, name, isPrivate, hardware }) {
  const headers = { Authorization: `Bearer ${token}` }
  const body = {
    duplicate_from: TEMPLATE,
    name: name || 'DSU-Worker',
    sdk: 'docker',
    private: !!isPrivate,
    hardware: hardware || 'cpu-basic'
  }
  const resp = await axios.post(HF_API, body, { headers })
  return resp.data // contains repo info, e.g. { id: "username/DSU-Worker", ... }
}

function spaceUrlFromRepoId(repoId) {
  // Heuristic subdomain used by HF Spaces
  const slug = String(repoId).replace('/', '-').toLowerCase()
  return `https://${slug}.hf.space`
}

async function waitUntilUp(url, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      await axios.get(url, { timeout: 5000 })
      return true
    } catch {}
    await new Promise(r => setTimeout(r, 3000))
  }
  return false
}

async function main() {
  const args = parseArgs(process.argv)
  const token = readToken(args.token)
  const duplicateLink = `https://huggingface.co/spaces/${TEMPLATE}?duplicate=true&hardware=${encodeURIComponent(args.hardware || 'cpu-basic')}&sdk=docker&title=${encodeURIComponent(args.name || 'DSU-Worker')}`

  if (!token) {
    console.log('No HF token found. Opening duplicate link in your browser...')
    console.log(duplicateLink)
    openInBrowser(duplicateLink)
    process.stdout.write('After duplication, paste your Space URL (e.g., https://username-dsu-worker.hf.space): ')
    process.stdin.setEncoding('utf8')
    process.stdin.once('data', (line) => {
      const url = line.trim()
      if (!url) {
        console.error('No URL provided. Aborting.')
        process.exit(1)
      }
      try {
        const spaces = addSpaceUrl(url)
        console.log(JSON.stringify({ added: url, spaces }, null, 2))
        process.exit(0)
      } catch (e) {
        console.error('ERROR', e.message)
        process.exit(1)
      }
    })
    return
  }

  try {
    const meta = await createByAPI({ token, name: args.name, isPrivate: args.private, hardware: args.hardware })
    const repoId = meta.id || meta.repo_id || ''
    if (!repoId) throw new Error('Failed to parse Space repo id')
    const url = spaceUrlFromRepoId(repoId)
    console.log('Space created:', repoId, '| URL:', url)
    const ok = await waitUntilUp(url, (args.waitSecs ? args.waitSecs : 180) * 1000)
    if (!ok) console.warn('Space not ready yet, but saved URL for later.')
    const spaces = addSpaceUrl(url)
    console.log(JSON.stringify({ created: repoId, url, spaces }, null, 2))
  } catch (e) {
    console.error('API duplicate failed, opening browser flow instead ...', e.message)
    openInBrowser(duplicateLink)
    process.stdout.write('After duplication, paste your Space URL (e.g., https://username-dsu-worker.hf.space): ')
    process.stdin.setEncoding('utf8')
    process.stdin.once('data', (line) => {
      const url = line.trim()
      if (!url) {
        console.error('No URL provided. Aborting.')
        process.exit(1)
      }
      try {
        const spaces = addSpaceUrl(url)
        console.log(JSON.stringify({ added: url, spaces }, null, 2))
        process.exit(0)
      } catch (err) {
        console.error('ERROR', err.message)
        process.exit(1)
      }
    })
  }
}

if (require.main === module) {
  main().catch(e => { console.error('ERROR', e.message); process.exit(1) })
}



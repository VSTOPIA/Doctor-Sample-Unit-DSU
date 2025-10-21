#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const axios = require('axios')
const { addSpaceUrl } = require('./hf_client')

async function main() {
  // Lazy require so repo doesn't crash if playwright isn't installed yet
  let chromium
  try {
    ({ chromium } = require('playwright'))
  } catch (e) {
    console.error('Missing dependency: playwright. Install with:')
    console.error('  npm i -D playwright')
    process.exit(1)
  }

  const args = parseArgs(process.argv)
  const name = args.name || 'DSU-Worker'
  const hardware = args.hardware || 'cpu-basic'
  const title = encodeURIComponent(name)
  const duplicateUrl = `https://huggingface.co/spaces/VSTOPIA/DSU?duplicate=true&hardware=${encodeURIComponent(hardware)}&sdk=docker&title=${title}`

  const userDataDir = path.join(os.homedir(), 'Documents', 'doctorsampleunit_DSU', '.playwright')
  fs.mkdirSync(userDataDir, { recursive: true })
  const headless = args.headless !== 'false'

  const context = await chromium.launchPersistentContext(userDataDir, { headless })
  const page = await context.newPage()
  await page.goto(duplicateUrl, { waitUntil: 'domcontentloaded' })

  // If login is required and creds provided, try to login
  const needLogin = await page.locator('text=Sign in').first().isVisible().catch(() => false)
  if (needLogin && process.env.HF_USER && process.env.HF_PASS) {
    try {
      // Attempt to find login form
      await page.click('text=Sign in')
      await page.waitForTimeout(500)
      // Username/password fields selectors may change; try common ones
      const uSel = 'input[name="username"], input[name="email"], input#username'
      const pSel = 'input[type="password"], input#password'
      await page.locator(uSel).first().fill(process.env.HF_USER)
      await page.locator(pSel).first().fill(process.env.HF_PASS)
      await page.keyboard.press('Enter')
      await page.waitForLoadState('domcontentloaded')
      await page.goto(duplicateUrl, { waitUntil: 'domcontentloaded' })
    } catch {}
  }

  // Click Duplicate/Create if present
  const dupButton = page.locator('button:has-text("Duplicate")')
  if (await dupButton.first().isVisible().catch(() => false)) {
    await dupButton.first().click()
  }
  const createButton = page.locator('button:has-text("Create")')
  if (await createButton.first().isVisible().catch(() => false)) {
    await createButton.first().click()
  }

  // Wait for navigation to the new space repo page
  const repoId = await waitForRepoId(page, 120000)
  if (!repoId) {
    console.error('Failed to detect new Space repo id. Complete duplication manually, then rerun.')
    await context.close()
    process.exit(1)
  }
  const url = spaceUrlFromRepoId(repoId)
  // Probe until up (best effort)
  await waitUntilUp(url, (parseInt(args.waitSecs || '120', 10)) * 1000)
  const spaces = addSpaceUrl(url)
  console.log(JSON.stringify({ created: repoId, url, spaces }, null, 2))
  await context.close()
}

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    const next = i + 1 < argv.length ? argv[i + 1] : undefined
    switch (a) {
      case '--name': args.name = next; i++; break
      case '--hardware': args.hardware = next; i++; break
      case '--headless': args.headless = next; i++; break
      case '--wait-secs': args.waitSecs = next; i++; break
      default: break
    }
  }
  return args
}

async function waitForRepoId(page, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const url = page.url()
    const m = url.match(/\/spaces\/([^\/?#]+)\/([^\/?#]+)/)
    if (m) return `${m[1]}/${m[2]}`
    await page.waitForTimeout(1000)
  }
  return ''
}

function spaceUrlFromRepoId(repoId) {
  return `https://${String(repoId).replace('/', '-').toLowerCase()}.hf.space`
}

async function waitUntilUp(url, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try { await axios.get(url, { timeout: 5000 }); return true } catch {}
    await new Promise(r => setTimeout(r, 3000))
  }
  return false
}

if (require.main === module) {
  main().catch(e => { console.error('ERROR', e.message); process.exit(1) })
}



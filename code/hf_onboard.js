#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const axios = require('axios')
const crypto = require('crypto')

async function main() {
  let chromium
  try { ({ chromium } = require('playwright')) } catch (e) {
    console.error('Missing dependency: playwright. Install with:')
    console.error('  npm i playwright && npx playwright install')
    process.exit(1)
  }
  let brokerMod
  try { brokerMod = require('./captcha_broker') } catch (e) {
    console.error('Missing captcha broker. Make sure code/captcha_broker.js exists.')
    process.exit(1)
  }
  let client
  try { client = require('./hf_client') } catch (e) {
    console.error('Missing hf_client. Make sure code/hf_client.js exists.')
    process.exit(1)
  }

  const args = parseArgs(process.argv)
  const email = args.email || process.env.HF_EMAIL
  let password = args.password || process.env.HF_PASSWORD
  const spaceName = args.name || 'DSU-Worker'
  const hardware = args.hardware || 'cpu-basic'
  const headless = args.headless !== 'false'
  if (!email || !password) {
    console.error('Usage: node code/hf_onboard.js --email you@example.com --password <password> [--name DSU-Worker] [--hardware cpu-basic] [--headless true]')
    process.exit(1)
  }

  if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(os.homedir(), 'Documents', 'Max 9', 'Max for Live Devices', 'DSU Project', 'PlaywrightBrowsers')
  }
  const userDataDir = path.join(os.homedir(), 'Documents', 'doctorsampleunit_DSU', '.playwright')
  fs.mkdirSync(userDataDir, { recursive: true })
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless,
    userAgent: ua,
    viewport: { width: 1280, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  })
  const page = await ctx.newPage()
  await ctx.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' })
  await page.addInitScript(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) } catch {}
    try { window.chrome = { runtime: {} } } catch {}
    try { Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] }) } catch {}
    try { Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] }) } catch {}
  })

  // Start broker for human-in-the-loop steps
  const broker = brokerMod.createBroker(page, { port: args.port ? Number(args.port) : 0 })
  try {
    const outDir = path.join(os.homedir(), 'Documents', 'doctorsampleunit_DSU')
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, 'broker.json'), JSON.stringify({ url: broker.url }, null, 2))
    // Also open the HTML UI with the correct broker query param
    // Try opening via broker-hosted URL first (if we later add /ui), else file:// fallback
    openInBrowser(broker.url + '/ui?broker=' + encodeURIComponent(broker.url))
    setTimeout(() => {
      const uiPath = path.join(__dirname, 'captcha_ui.html')
      openInBrowser(uiPath + '?broker=' + encodeURIComponent(broker.url))
    }, 1200)
  } catch {}

  // Step 1: Create/Sign-in flow
  // Try join first; if user already exists, switch to login
  await page.goto('https://huggingface.co/join', { waitUntil: 'domcontentloaded' })
  // Handle potential CloudFront 403 blocks by warming homepage and retrying
  if (await isCloudfrontBlocked(page)) {
    await page.goto('https://huggingface.co/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    await page.goto('https://huggingface.co/join', { waitUntil: 'domcontentloaded' })
  }
  await page.waitForTimeout(800)
  // Auto-press Begin if puzzle pre-gate is visible
  try { const btn = page.locator('button:has-text("Begin"), button:has-text("begin")').first(); if (await btn.isVisible()) { await btn.click(); await page.waitForTimeout(500) } } catch {}
  let atJoin = await page.locator('text=/Create your account|Join Hugging Face/i').first().isVisible().catch(() => false)
  if (atJoin) {
    // Fill email & password
    await smartFill(page, { email, password })
    // Try submit
    await smartSubmit(page)
    await page.waitForTimeout(1200)
  }

  // Detect captcha or verification prompt
  const captchaOrVerify = await page.locator('text=/let\'s confirm you are human|verify your email|check your email/i').first().isVisible().catch(() => false)
  if (captchaOrVerify) {
    console.log(JSON.stringify({ broker: broker.url, hint: 'Solve CAPTCHA if present, then click verification link in your email.' }, null, 2))
    // Poll until captcha cleared (re-use existing broker, don’t bind again)
    await brokerMod.ensureHuman(page, { port: Number(new URL(broker.url).port), existing: true })
  }

  // If HF flags exposed password, set a strong one automatically
  if (await exposedPasswordPrompt(page)) {
    password = generateStrongPassword()
    await setNewPassword(page, password)
    persistCredentials(email, password)
  }

  // If still needs verification, pause until user completes it externally
  let verified = false
  for (let i = 0; i < 60; i++) {
    const needsVerify = await page.locator('text=/verify your email|check your email/i').first().isVisible().catch(() => false)
    if (!needsVerify) { verified = true; break }
    await page.waitForTimeout(5000)
    await page.reload({ waitUntil: 'domcontentloaded' })
  }

  // Step 2: Log in (in case we need an explicit login after verification)
  await page.goto('https://huggingface.co/login', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  try {
    await page.getByLabel(/email/i).first().fill(email)
  } catch { try { await page.locator('input[type="email"], input[name="username"], input[name="email"]').first().fill(email) } catch {} }
  try {
    await page.getByLabel(/password/i).first().fill(password)
  } catch { try { await page.locator('input[type="password"], input[name="password"]').first().fill(password) } catch {} }
  await smartSubmit(page)
  await page.waitForTimeout(1000)

  // Check logged-in by navigating to profile
  await page.goto('https://huggingface.co/settings/profile', { waitUntil: 'domcontentloaded' })
  const isLogged = await page.locator('text=/Email|Username/i').first().isVisible().catch(() => false)
  if (!isLogged) {
    console.error('Login did not complete. Please ensure email was verified, then rerun.')
    await ctx.close(); process.exit(1)
  }

  // Step 3: Duplicate Space (within same session)
  const dupUrl = `https://huggingface.co/spaces/VSTOPIA/DSU?duplicate=true&hardware=${encodeURIComponent(hardware)}&sdk=docker&title=${encodeURIComponent(spaceName)}`
  await page.goto(dupUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  // Click Duplicate/Create
  try { await page.getByRole('button', { name: /duplicate|create/i }).first().click() } catch {}
  // Wait for repo id
  const repoId = await waitForRepoId(page, 120000)
  if (!repoId) {
    console.error('Failed to create Space. Try again from the UI.')
    await ctx.close(); process.exit(1)
  }
  const spaceUrl = spaceUrlFromRepoId(repoId)

  // Wait Space up
  await waitUntilUp(spaceUrl, 180000)
  // Save to client config
  client.addSpaceUrl(spaceUrl)

  console.log(JSON.stringify({ ok: true, space: { repoId, url: spaceUrl }, broker: broker.url }, null, 2))
  await ctx.close()
}

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    const next = i + 1 < argv.length ? argv[i + 1] : undefined
    switch (a) {
      case '--email': args.email = next; i++; break
      case '--password': args.password = next; i++; break
      case '--name': args.name = next; i++; break
      case '--hardware': args.hardware = next; i++; break
      case '--headless': args.headless = next; i++; break
      case '--port': args.port = next; i++; break
      default: break
    }
  }
  return args
}

async function smartFill(page, { email, password }) {
  try { await page.getByLabel(/email/i).first().fill(email) } catch {}
  try { await page.getByPlaceholder(/email/i).first().fill(email) } catch {}
  try { await page.locator('input[type="email"], input[name="email"], input#email').first().fill(email) } catch {}
  try { await page.getByLabel(/password/i).first().fill(password) } catch {}
  try { await page.getByPlaceholder(/password/i).first().fill(password) } catch {}
  try { await page.locator('input[type="password"], input[name="password"], input#password').first().fill(password) } catch {}
  try { await page.locator('input[name="terms"], input#terms, input[type="checkbox"]').first().check({ force: true }) } catch {}
}

async function smartSubmit(page) {
  try { await page.getByRole('button', { name: /create|sign up|continue|join/i }).first().click() } catch {}
  try { await page.keyboard.press('Enter') } catch {}
  try { await page.locator('button:has-text("Create"), button:has-text("Sign up"), button[type="submit"]').first().click() } catch {}
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

async function isCloudfrontBlocked(page) {
  try {
    const body = await page.textContent('body')
    return /403 ERROR|Request blocked|cloudfront/i.test(String(body || ''))
  } catch { return false }
}

function generateStrongPassword() {
  const raw = crypto.randomBytes(18).toString('base64url')
  // Ensure mixed charset
  return raw + 'Aa1!'
}

async function exposedPasswordPrompt(page) {
  try {
    return await page.locator('text=/password has been exposed|set a new password|pwned/i').first().isVisible()
  } catch { return false }
}

async function setNewPassword(page, newPass) {
  // Try to fill two visible password inputs
  const inputs = page.locator('input[type="password"]')
  const count = await inputs.count().catch(() => 0)
  let filled = 0
  for (let i = 0; i < count && filled < 2; i++) {
    try {
      const inp = inputs.nth(i)
      if (await inp.isVisible()) { await inp.fill(newPass); filled++ }
    } catch {}
  }
  await smartSubmit(page)
  await page.waitForTimeout(800)
}

function persistCredentials(email, password) {
  try {
    const outDir = path.join(os.homedir(), 'Documents', 'doctorsampleunit_DSU')
    const p = path.join(outDir, 'hf_credentials.json')
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(p, JSON.stringify({ email, password, ts: new Date().toISOString() }, null, 2))
  } catch {}
}

if (require.main === module) {
  main().catch(e => { console.error('ERROR', e.message); process.exit(1) })
}

function openInBrowser(p) {
  const { exec } = require('child_process')
  const plat = process.platform
  const cmd = plat === 'darwin' ? `open "${p}"` : plat === 'win32' ? `start "" "${p}"` : `xdg-open "${p}"`
  exec(cmd)
}



#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')

async function main() {
  let chromium
  try { ({ chromium } = require('playwright')) } catch (e) {
    console.error('Missing dependency: playwright. Install with:')
    console.error('  npm i -D playwright')
    process.exit(1)
  }

  // Prefer project-local browser cache
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(os.homedir(), 'Documents', 'Max 9', 'Max for Live Devices', 'DSU Project', 'PlaywrightBrowsers')
  }

  const args = parseArgs(process.argv)
  const email = args.email || process.env.HF_EMAIL || ''
  const password = args.password || process.env.HF_PASSWORD || ''
  const headless = args.headless !== 'false'
  if (!email || !password) {
    console.error('Usage: node code/hf_account_create.js --email you@example.com --password <password> [--headless true]')
    process.exit(1)
  }

  const userDataDir = args.userDataDir || path.join(os.homedir(), 'Documents', 'doctorsampleunit_DSU', '.playwright')
  fs.mkdirSync(userDataDir, { recursive: true })

  const context = await chromium.launchPersistentContext(userDataDir, { headless })
  const page = await context.newPage()
  // Start lightweight HTTP broker so the DSU UI can render the page as an image
  let broker
  try { broker = require('./captcha_broker'); } catch {}

  // Navigate to join/signup
  await page.goto('https://huggingface.co/join', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  // Try robust locators via role/label/placeholder with fallbacks
  let emailOk = false, passOk = false
  try {
    const emailLocator = page.getByLabel(/email/i).first()
    await emailLocator.fill(email)
    emailOk = true
  } catch {}
  if (!emailOk) {
    try { await page.getByPlaceholder(/email/i).first().fill(email); emailOk = true } catch {}
  }
  if (!emailOk) {
    try { await page.locator('input[type="email"], input[name="email"], input#email').first().fill(email); emailOk = true } catch {}
  }

  try {
    const passLocator = page.getByLabel(/password/i).first()
    await passLocator.fill(password)
    passOk = true
  } catch {}
  if (!passOk) {
    try { await page.getByPlaceholder(/password/i).first().fill(password); passOk = true } catch {}
  }
  if (!passOk) {
    try { await page.locator('input[type="password"], input[name="password"], input#password').first().fill(password); passOk = true } catch {}
  }

  if (!emailOk || !passOk) {
    console.error('Could not find email/password fields on HF join page.')
    await context.close(); process.exit(1)
  }

  // Accept terms if present
  try { await page.locator('input[name="terms"], input#terms, input[type="checkbox"]').first().check({ force: true }) } catch {}

  // Submit
  let submitted = false
  try { await page.getByRole('button', { name: /create|sign up|continue|join/i }).first().click(); submitted = true } catch {}
  if (!submitted) {
    try { await page.keyboard.press('Enter'); submitted = true } catch {}
  }
  if (!submitted) {
    try { await page.locator('button:has-text("Create"), button:has-text("Sign up"), button[type="submit"]').first().click(); submitted = true } catch {}
  }

  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1200)

  // Detect verification prompt or errors
  const verifyHint = await page.locator('text=/verify your email|check your email/i').first().isVisible().catch(() => false)
  const errHint = await page.locator('text=/already exists|invalid|error|try again/i').first().isVisible().catch(() => false)

  const out = {
    status: verifyHint ? 'pending_verification' : (errHint ? 'error' : 'unknown'),
    message: verifyHint ? 'Verification email sent. Please click the link in your inbox to activate your account.' : (errHint ? 'Signup may have failed; check the page for details.' : 'Check your email for any verification steps.'),
    userDataDir,
    broker: undefined
  }
  try {
    if (broker) {
      const srv = broker.createBroker(page, { port: 45111 })
      out.broker = srv.url
    }
  } catch {}
  console.log(JSON.stringify(out, null, 2))

  await context.close()
}

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    const next = i + 1 < argv.length ? argv[i + 1] : undefined
    switch (a) {
      case '--email': args.email = next; i++; break
      case '--password': args.password = next; i++; break
      case '--headless': args.headless = next; i++; break
      case '--userDataDir': args.userDataDir = next; i++; break
      default: break
    }
  }
  return args
}

if (require.main === module) {
  main().catch(e => { console.error('ERROR', e.message); process.exit(1) })
}



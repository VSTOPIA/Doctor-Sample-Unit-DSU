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

  // Navigate to join/signup
  await page.goto('https://huggingface.co/join', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  // Fill email and password; selectors may change; try several
  const emailSel = 'input[name="email"], input#email, input[type="email"]'
  const passSel = 'input[name="password"], input#password, input[type="password"]'
  const agreeSel = 'input[name="terms"], input#terms, input[type="checkbox"]'

  try {
    await page.locator(emailSel).first().fill(email)
    await page.locator(passSel).first().fill(password)
  } catch (e) {
    console.error('Could not find email/password fields on HF join page.')
    await context.close(); process.exit(1)
  }

  // Accept terms if present
  try { await page.locator(agreeSel).first().check({ force: true }) } catch {}

  // Submit (try Enter or visible button)
  let submitted = false
  try { await page.keyboard.press('Enter'); submitted = true } catch {}
  if (!submitted) {
    const btnSel = 'button:has-text("Create"), button:has-text("Sign up"), button[type="submit"]'
    try { await page.locator(btnSel).first().click(); submitted = true } catch {}
  }

  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)

  // Detect verification prompt
  const verifyHint = await page.locator('text=/verify your email/i').first().isVisible().catch(() => false)
  const errHint = await page.locator('text=/already exists|invalid|error/i').first().isVisible().catch(() => false)

  const out = {
    status: verifyHint ? 'pending_verification' : (errHint ? 'error' : 'unknown'),
    message: verifyHint ? 'Verification email sent. Please click the link in your inbox to activate your account.' : (errHint ? 'Signup may have failed; check the page for details.' : 'Check your email for any verification steps.'),
    userDataDir,
  }
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



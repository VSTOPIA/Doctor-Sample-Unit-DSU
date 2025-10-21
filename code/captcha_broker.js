const express = require('express')

function createBroker(page, { port = 45111 } = {}) {
  const app = express()
  app.use(express.json({ limit: '1mb' }))
  // CORS for jweb/jsui
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') return res.sendStatus(200)
    next()
  })

  async function getStatus() {
    let text = ''
    try { text = await page.textContent('body') } catch {}
    const hasConfirm = /let's confirm you are human/i.test(String(text || ''))
    const hasEmail = await page.locator('input[type="email"], input[name="email"], input#email').first().isVisible().catch(() => false)
    const state = hasConfirm ? 'captcha' : (hasEmail ? 'form' : 'unknown')
    const vp = page.viewportSize?.() || { width: 1280, height: 800 }
    return { state, viewport: vp }
  }

  app.get('/state', async (req, res) => {
    try { res.json(await getStatus()) } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.get('/screenshot', async (req, res) => {
    try {
      const buf = await page.screenshot({ type: 'png', fullPage: false })
      res.set('Content-Type', 'image/png').send(buf)
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  app.post('/click', async (req, res) => {
    try {
      const { x, y } = req.body || {}
      if (typeof x !== 'number' || typeof y !== 'number') return res.status(400).json({ error: 'x,y required' })
      await page.mouse.click(x, y)
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.post('/press', async (req, res) => {
    try { const { key } = req.body || {}; if (!key) return res.status(400).json({ error: 'key required' }); await page.keyboard.press(key); res.json({ ok: true }) } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.post('/begin', async (req, res) => {
    try {
      const sel = 'button:has-text("Begin"), button:has-text("begin")'
      const el = page.locator(sel).first()
      if (await el.isVisible()) await el.click()
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.post('/confirm', async (req, res) => {
    try {
      const sel = 'button:has-text("Confirm"), button:has-text("confirm")'
      const el = page.locator(sel).first()
      if (await el.isVisible()) await el.click()
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // Allow port 0 (random) or retry if fixed port is in use
  let server
  let chosen = port || 0
  for (let i = 0; i < 20; i++) {
    try {
      server = app.listen(chosen)
      break
    } catch (e) {
      if (e && e.code === 'EADDRINUSE' && port) { chosen++; continue }
      throw e
    }
  }
  const actual = () => {
    const addr = server.address()
    const p = typeof addr === 'object' && addr ? addr.port : chosen
    return `http://127.0.0.1:${p}`
  }
  return { server, url: actual() }
}

async function ensureHuman(page, { port, existing } = {}) {
  let server
  let url
  if (existing && port) {
    url = `http://127.0.0.1:${port}`
  } else {
    const created = createBroker(page, { port })
    server = created.server
    url = created.url
  }
  // Poll until captcha screen is gone or timeout
  const t0 = Date.now(); const maxMs = 10 * 60 * 1000
  while (Date.now() - t0 < maxMs) {
    let txt = ''
    try { txt = await page.textContent('body') } catch {}
    const still = /let's confirm you are human|choose all the/i.test(String(txt || ''))
    if (!still) break
    await new Promise(r => setTimeout(r, 1500))
  }
  try { if (server) server.close() } catch {}
  return url
}

module.exports = { createBroker, ensureHuman }



/**
 * Behaviour smoke for the widget step machine, driven against the REAL built
 * bundle in mock mode (`apiBase: 'mock'`, no backend). This repo has no unit
 * tests, and the step machine is the part a refactor is most likely to break
 * silently - the progress bar can relabel itself and the flow still "works".
 *
 * Run:
 *   npm run build
 *   python3 -m http.server 4500          # from the repo root
 *   CHROME_EXE=<path to a chromium> node scripts/step-smoke.mjs
 *
 * Playwright is intentionally NOT a dependency here (the bundle must stay
 * dependency-free and the lockfile untouched): install it wherever convenient and
 * point CHROME_EXE at a browser you already have, e.g. one from
 * ~/Library/Caches/ms-playwright.
 *
 * What it pins, and why each one is a real failure mode:
 *  - the provider step appears only when there is something to choose, and the
 *    step COUNT and LABELS follow (a 4-step flow silently becoming "KROK 2 Z 4 /
 *    WYBÓR TERMINU" is the classic off-by-one),
 *  - back walks the steps that exist, so an absent provider step is skipped in
 *    both directions,
 *  - a pool service (fulfillmentMode 'unit') labels the step WYBÓR ZASOBU,
 *  - a service with variants/add-ons blocks advancing until its sheet is closed.
 */
import { chromium } from 'playwright'

const URL = process.env.HARNESS_URL || 'http://localhost:4500/scripts/mock-harness.html'
let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`OK   ${name}`) }
  else { fail++; console.log(`FAIL ${name}   ${extra}`) }
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE })
const page = await browser.newPage()
page.on('pageerror', (e) => { fail++; console.log('FAIL pageerror:', e.message) })
page.on('console', (m) => { if (m.type() === 'error') console.log('   console.error:', m.text()) })

const state = () => page.evaluate(() => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  if (!host) return null
  const r = host.shadowRoot
  const t = (s) => r.querySelector(s)?.textContent?.trim() ?? null
  return {
    krok: t('.vz-prog-krok'),
    stepName: t('.vz-prog-name'),
    bars: r.querySelectorAll('.vz-prog-bar').length,
    title: t('.vz-h h2'),
    hasBack: !!r.querySelector('.vz-iconbtn[aria-label="Wstecz"]'),
    ctaText: t('.vz-cta button'),
    ctaDisabled: !!r.querySelector('.vz-cta button[disabled]'),
    configuring: !!r.querySelector('.vz-cfg, .vz-configure') || /Wariant/.test(r.textContent),
    body: r.textContent.replace(/\s+/g, ' ').trim(),
  }
})

const clickByText = (text, sel = 'button, [role=button], [role=radio], [role=checkbox], .vz-card-hit') =>
  page.evaluate(({ text, sel }) => {
    const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
    const r = host.shadowRoot
    const els = [...r.querySelectorAll(sel)]
    const el = els.find((e) => ((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '')).includes(text))
    if (!el) return false
    el.click()
    return true
  }, { text, sel })

/** Click the "+" control that belongs to the card whose title matches. */
const addService = (name) => page.evaluate((name) => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  const r = host.shadowRoot
  const card = [...r.querySelectorAll('.vz-card')].find((c) => c.textContent.includes(name))
  if (!card) return 'no-card'
  const add = card.querySelector('button[aria-label*="Dodaj"], .vz-add, button:not(.vz-card-hit)')
  if (!add) return 'no-add'
  add.click()
  return 'ok'
}, name)

const next = () => clickByText('Dalej')
const back = () => page.evaluate(() => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  const b = host.shadowRoot.querySelector('.vz-iconbtn[aria-label="Wstecz"]')
  if (!b) return false
  b.click()
  return true
})
/**
 * A service carrying variants/add-ons auto-opens the configure sheet on add, and
 * the cart is deliberately NOT advanceable until it is closed. Close it so the
 * step assertions are about the step machine and nothing else.
 */
const closeConfigure = async () => {
  const closed = await clickByText('Gotowe')
  if (closed) await page.waitForTimeout(300)
  return closed
}
const reload = async () => { await page.goto(URL); await page.waitForTimeout(800) }

await reload()

// ── 1. Fresh cart: service step is first, 4 bars only appear once a provider
//       step is actually needed.
let s = await state()
ok('widget wyrenderowany', !!s && s.body.includes('Strzyżenie'), s?.body?.slice(0, 100))
ok('start = KROK 1 Z 4 (mock ma wybór specjalisty)', s.krok === 'KROK 1 Z 4', `${s.krok}`)
ok('etykieta kroku 1 = WYBÓR USŁUGI', s.stepName === 'WYBÓR USŁUGI', `${s.stepName}`)
ok('liczba pasków = total', s.bars === 4, `${s.bars}`)
ok('CTA wyłączone przy pustym koszyku', s.ctaDisabled, `${s.ctaText}`)

// ── 2. providerSelection 'customer' with 3 workers -> provider step EXISTS.
ok('dodanie Strzyżenia', (await addService('Strzyżenie')) === 'ok')
await page.waitForTimeout(250)
ok('arkusz wariantu otwiera się sam i daje się zamknąć', await closeConfigure())
s = await state()
ok('CTA aktywne po dodaniu usługi', !s.ctaDisabled, `${s.ctaText}`)
await next(); await page.waitForTimeout(350)
s = await state()
ok('krok 2 = WYBÓR SPECJALISTY', s.stepName === 'WYBÓR SPECJALISTY', `${s.stepName}`)
ok('krok 2 numeracja', s.krok === 'KROK 2 Z 4', `${s.krok}`)
ok('wstecz istnieje na kroku 2', s.hasBack)

// ── 3. Back goes to the service step, not somewhere derived from an index.
await back(); await page.waitForTimeout(300)
s = await state()
ok('wstecz z kroku 2 wraca na WYBÓR USŁUGI', s.stepName === 'WYBÓR USŁUGI', `${s.stepName}`)
ok('koszyk przetrwał cofnięcie', s.body.includes('Strzyżenie'))

// ── 4. Forward to the time step and check numbering + label.
await next(); await page.waitForTimeout(300)
await clickByText('Bez preferencji'); await page.waitForTimeout(200)
await next(); await page.waitForTimeout(900)
s = await state()
ok('krok 3 = WYBÓR TERMINU', s.stepName === 'WYBÓR TERMINU', `${s.stepName}`)
ok('krok 3 numeracja', s.krok === 'KROK 3 Z 4', `${s.krok}`)

// ── 5. providerSelection 'auto' -> provider step SKIPPED, flow is 3 steps.
await reload()
ok('dodanie pakietu z auto-przydziałem', (await addService('Strzyżenie + broda')) === 'ok')
await page.waitForTimeout(250)
s = await state()
ok('auto: total spada do 3', s.krok === 'KROK 1 Z 3', `${s.krok}`)
ok('auto: 3 paski', s.bars === 3, `${s.bars}`)
await next(); await page.waitForTimeout(900)
s = await state()
ok('auto: krok 2 to od razu TERMIN', s.stepName === 'WYBÓR TERMINU', `${s.stepName}`)
ok('auto: numeracja 2 z 3', s.krok === 'KROK 2 Z 3', `${s.krok}`)
await back(); await page.waitForTimeout(300)
s = await state()
ok('auto: wstecz z terminu wraca na USŁUGI (pomija nieistniejący krok)', s.stepName === 'WYBÓR USŁUGI', `${s.stepName}`)

// ── 6. Single-eligible-worker service -> provider step skipped too.
await reload()
ok('dodanie usługi tylko u jednej osoby', (await addService('Golenie brzytwą')) === 'ok')
await page.waitForTimeout(250)
s = await state()
ok('jeden wykonawca: total 3', s.krok === 'KROK 1 Z 3', `${s.krok}`)

// ── 7. Pool service (fulfillmentMode 'unit') -> provider step is the RESOURCE one.
await reload()
ok('dodanie usługi z puli obiektów', (await addService('Loża VIP')) === 'ok')
await page.waitForTimeout(250)
await next(); await page.waitForTimeout(350)
s = await state()
ok('pula: krok 2 = WYBÓR ZASOBU', s.stepName === 'WYBÓR ZASOBU', `${s.stepName}`)

await browser.close()
console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)

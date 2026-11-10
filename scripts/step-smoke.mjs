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
    // Exclude <style>: shadowRoot.textContent starts with the whole stylesheet,
    // which makes any /needle/ test pass or fail for the wrong reason.
    body: [...r.children].filter((e) => e.tagName !== 'STYLE').map((e) => e.textContent).join(' ').replace(/\s+/g, ' ').trim(),
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

/** What the mock was asked (src/mock.ts): GET /loyalty reads, rental reads and the last create's input. */
const journal = () => page.evaluate(() => ({ loyaltyReads: 0, rentalReads: 0, lastCreate: null, ...(window.__VIZYTO_MOCK_JOURNAL__ ?? {}) }))
/** The CTA bar's two text lines (offer name, meta line). */
const ctaLines = () => page.evaluate(() => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  const t = (s) => host.shadowRoot.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() ?? null
  return { svc: t('.vz-cta .vz-cta-svc'), meta: t('.vz-cta .vz-cta-meta') }
})
/** Polls the widget until its text matches `re` or `ms` pass; returns the state then. */
const waitForText = async (re, ms) => {
  const end = Date.now() + ms
  let st = await state()
  while (!re.test(st?.body ?? '') && Date.now() < end) {
    await page.waitForTimeout(150)
    st = await state()
  }
  return st
}

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
/** On a visit's time step: the first free day, then its 10:00 or 11:00. */
const pickTerm = async () => {
  await page.evaluate(() => {
    const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
    host.shadowRoot.querySelector('.vz-day:not(.is-disabled)')?.click()
  })
  await page.waitForTimeout(1000)
  await page.evaluate(() => {
    const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
    ;[...host.shadowRoot.querySelectorAll('.vz-slot')].find((x) => /1[01]:00/.test(x.textContent))?.click()
  })
  await page.waitForTimeout(300)
}
/** Hour tiles shown as picked. */
const pickedSlots = () => page.evaluate(() => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  return [...host.shadowRoot.querySelectorAll('.vz-slot[aria-pressed="true"], .vz-slot.selected')].map((x) => x.textContent.trim())
})

/**
 * The mock business sells BOTH visits and classes, so every visit-path scenario
 * starts by answering the fork. `toServices()` is that one tap.
 */
const toServices = async () => {
  await clickByText('Wizyta indywidualna')
  await page.waitForTimeout(350)
}

await reload()
await toServices()

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
await reload(); await toServices()
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
await reload(); await toServices()
ok('dodanie usługi tylko u jednej osoby', (await addService('Golenie brzytwą')) === 'ok')
await page.waitForTimeout(250)
s = await state()
ok('jeden wykonawca: total 3', s.krok === 'KROK 1 Z 3', `${s.krok}`)

// ── 7. Pool service (fulfillmentMode 'unit') -> provider step is the RESOURCE one.
await reload(); await toServices()
ok('dodanie usługi z puli obiektów', (await addService('Loża VIP')) === 'ok')
await page.waitForTimeout(250)
await next(); await page.waitForTimeout(350)
s = await state()
ok('pula: krok 2 = WYBÓR ZASOBU', s.stepName === 'WYBÓR ZASOBU', `${s.stepName}`)

// ── 8. Group classes: the fork appears only for a MIXED business, and the class
//       branch is its own two-step flow with its own labels.
await reload()
s = await state()
ok('mieszany biznes: widelec na wejściu, bez licznika kroków', s.krok === null && /Co chcesz zarezerwować|Wizyta indywidualna/.test(s.body), `${s.krok} | ${s.body.slice(0, 90)}`)
ok('widelec: CTA nieaktywne, dopóki nic nie wybrano', s.ctaDisabled, `${s.ctaText}`)

ok('wybór zajęć grupowych na widelcu', await clickByText('Zajęcia grupowe'))
await page.waitForTimeout(500)
s = await state()
ok('zajęcia: licznik startuje od 1 z 3', s.krok === 'KROK 1 Z 3', `${s.krok}`)
ok('zajęcia: etykieta WYBÓR ZAJĘĆ', s.stepName === 'WYBÓR ZAJĘĆ', `${s.stepName}`)
// cls 42 (open) and cls 43 (fixed) share the same backing service, so the name
// must appear exactly ONCE - twice would mean the fixed roster leaked in.
ok('zajęcia: klasa ze stałą grupą NIE jest na liście',
   (s.body.match(/Grupa zaawansowana/g) || []).length === 1,
   `wystąpień: ${(s.body.match(/Grupa zaawansowana/g) || []).length}`)
ok('zajęcia: darmowe wejście pokazuje "Bezpłatnie"', /Bezpłatnie/.test(s.body), s.body.slice(0, 140))

ok('wybór klasy', await clickByText('Trening otwarty'))
await page.waitForTimeout(600)
s = await state()
ok('zajęcia: krok 2 = WYBÓR TERMINU', s.stepName === 'WYBÓR TERMINU', `${s.stepName}`)
ok('zajęcia: krok 2 z 3', s.krok === 'KROK 2 Z 3', `${s.krok}`)
ok('grafik pokazuje prowadzącego', /Prowadzi:? Marek/.test(s.body), s.body.slice(0, 200))
// Since vizyto #171 a term states only that it is full (CLIENT/WEB seat chips).
ok('grafik nie liczy wolnych miejsc terminu', !/wolnych miejsc|wolne miejsca|wolne miejsce/.test(s.body), s.body.slice(0, 200))
ok('pełny termin oznaczony i nie do wybrania', /Brak miejsc/.test(s.body), s.body.slice(0, 260))
ok('CTA nieaktywne, dopóki nie wybrano terminu', s.ctaDisabled, `${s.ctaText}`)

// A full term must not become the selection.
const beforeFull = (await state()).ctaDisabled
await clickByText('Brak miejsc'); await page.waitForTimeout(250)
s = await state()
ok('klik w pełny termin nie odblokowuje CTA', s.ctaDisabled && beforeFull, `${s.ctaText}`)

// ── 9. Back from the class list returns to the fork (a mixed business must be
//       able to change its mind).
await back(); await page.waitForTimeout(300)
s = await state()
ok('wstecz z grafiku wraca na WYBÓR ZAJĘĆ', s.stepName === 'WYBÓR ZAJĘĆ', `${s.stepName}`)
await back(); await page.waitForTimeout(300)
s = await state()
ok('wstecz z listy zajęć wraca na widelec', s.krok === null && /Co chcesz zarezerwować|Wizyta indywidualna/.test(s.body), `${s.krok}`)

// ── 10. Prefill from a host-page timetable CTA skips straight to the terms.
await page.goto(URL.replace('mock-harness.html', 'mock-harness.html') + '?prefillClass=41')
await page.waitForTimeout(900)
s = await state()
ok('prefill classId: wchodzi od razu na grafik', s.stepName === 'WYBÓR TERMINU', `${s.stepName}`)
ok('prefill classId: bez widelca i bez ponownego wyboru klasy', /Prowadzi/.test(s.body), s.body.slice(0, 160))

// Prefill of the TERM alone. A club timetable knows the term id, not necessarily
// the class wrapping it, so this has to resolve on its own.
await page.goto(URL + '?prefillSession=901')
await page.waitForTimeout(1100)
s = await state()
ok('prefill sessionId sam: wchodzi na grafik właściwej klasy', s.stepName === 'WYBÓR TERMINU', `${s.stepName}`)
ok('prefill sessionId sam: termin wybrany, CTA otwarte', !s.ctaDisabled, `${s.ctaText}`)

// A prefilled FULL term must be dropped, not confirmed - the server answers
// SESSION_FULL and the customer would read that as our failure. (903 = 12/12.)
await page.goto(URL + '?prefillClass=41&prefillSession=903')
await page.waitForTimeout(1100)
s = await state()
ok('prefill pełnego terminu: CTA zostaje zamknięte', s.ctaDisabled, `${s.ctaText}`)
ok('prefill pełnego terminu: klient stoi na liście terminów', s.stepName === 'WYBÓR TERMINU' && /Brak miejsc/.test(s.body), `${s.stepName}`)

// A stale class prefill on a business that sells only services must not open an
// empty class catalog.
await page.goto(URL + '?onlyServices=1&prefillClass=41')
await page.waitForTimeout(1000)
s = await state()
ok('nieaktualny prefill zajęć na biznesie bez zajęć: spada na usługi', s.stepName === 'WYBÓR USŁUGI', `${s.stepName}`)

// ── 11. Rentals. Two time models in one mock: an HOURLY pool (slot grid, party
//        size) and a DAILY single instance (range, tiers, deposit).
await reload()
s = await state()
ok('widelec ma trzy rodziny', /Wynajem/.test(s.body), s.body.slice(0, 160))
ok('wybór wynajmu na widelcu', await clickByText('Wynajem'))
await page.waitForTimeout(500)
s = await state()
ok('wynajem: licznik 1 z 3', s.krok === 'KROK 1 Z 3', `${s.krok}`)
ok('wynajem: etykieta WYBÓR PRZEDMIOTU', s.stepName === 'WYBÓR PRZEDMIOTU', `${s.stepName}`)
// Two lanes of one type must be ONE card named by the type, not "Tor 1"/"Tor 2".
ok('pula dwóch torów zwinięta w jedną kartę typu',
   /Przydzielimy wolny egzemplarz \(2 szt\.\)/.test(s.body) && !/Tor bowlingowy 1/.test(s.body),
   s.body.slice(0, 260))
ok('egzemplarz eksponowany widoczny osobno', /Przyczepa Niewiadów/.test(s.body), s.body.slice(0, 260))

// --- slot mode (hourly pool) ---
ok('wybór puli torów', await clickByText('Przydzielimy wolny egzemplarz'))
await page.waitForTimeout(700)
s = await state()
ok('wynajem: krok 2 = WYBÓR TERMINU', s.stepName === 'WYBÓR TERMINU', `${s.stepName}`)
ok('godzinowy: pyta o liczbę osób', /Ile osób\?/.test(s.body), s.body.slice(0, 200))
ok('godzinowy: pigułki długości z ceną', /1 godzina/.test(s.body) && /80,00/.test(s.body), s.body.slice(0, 300))
ok('godzinowy: CTA zamknięte bez wybranej godziny', s.ctaDisabled, `${s.ctaText}`)
await clickByText('11:00'); await page.waitForTimeout(300)
s = await state()
ok('godzinowy: wybór godziny odblokowuje CTA', !s.ctaDisabled, `${s.ctaText}`)

// The tile says the business's wall clock ("11:00" in Warsaw), and the mock grid
// publishes the real instant (09:00Z in summer), like the API. A widget that
// glued "11:00" to "Z" books 13:00 local: the receipt would say so.
await page.goto(URL + '?signedIn=1'); await page.waitForTimeout(900)
await clickByText('Wynajem'); await page.waitForTimeout(500)
await clickByText('Przydzielimy wolny egzemplarz'); await page.waitForTimeout(800)
await clickByText('11:00'); await page.waitForTimeout(400)
await next(); await page.waitForTimeout(1300)
s = await state()
ok('godzinowy: odbiór o wybranej godzinie (strefa firmy, nie UTC)',
   /Odbiór\d{1,2} \S+, 11:00/.test(s.body) && /Zwrot\d{1,2} \S+, 12:00/.test(s.body), s.body.slice(0, 400))

// A rentable instance's resourceId alone names the rental family: no fork, and
// straight onto that instance's calendar (vizyto README, prefill table).
await page.goto(URL + '?prefillResource=31'); await page.waitForTimeout(1200)
s = await state()
ok('prefill egzemplarza bez kind: od razu kalendarz przyczepy',
   s.stepName === 'WYBÓR TERMINU' && /Na jak długo\?/.test(s.body) && /1 doba/.test(s.body) && !/Wizyta indywidualna/.test(s.body),
   `${s.stepName} | ${s.body.slice(0, 200)}`)

// A pool's rentalTypeId (the lane card on /r/) opens that pool's calendar: no
// fork, no list, and the server assigns the lane.
await page.goto(URL + '?prefillRentalType=7'); await page.waitForTimeout(1200)
s = await state()
ok('prefill puli bez kind: od razu kalendarz toru',
   s.stepName === 'WYBÓR TERMINU' && /Przydzielimy wolny egzemplarz na wybrany termin\./.test(s.body) && /Ile osób\?/.test(s.body) && !/Wizyta indywidualna/.test(s.body),
   `${s.stepName} | ${s.body.slice(0, 200)}`)

// --- range mode (daily instance) ---
await reload()
await clickByText('Wynajem'); await page.waitForTimeout(500)
ok('wybór przyczepy', await clickByText('Przyczepa Niewiadów'))
await page.waitForTimeout(900)
s = await state()
ok('dobowy: BRAK siatki godzin', !/Godzina odbioru/.test(s.body), s.body.slice(0, 300))
ok('dobowy: pokazuje zwrot i kaucję', /Zwrot/.test(s.body) && /Kaucja/.test(s.body), s.body.slice(0, 400))
ok('dobowy: nie pyta o liczbę osób (brak limitu)', !/Ile osób\?/.test(s.body), s.body.slice(0, 200))
ok('dobowy: progi cenowe w pigułkach', /1 doba/.test(s.body) && /120,00/.test(s.body), s.body.slice(0, 340))
// 3 days crosses the cheaper tier: 3 x 90,00 = 270,00
await clickByText('3 doby'); await page.waitForTimeout(900)
s = await state()
ok('dobowy: próg "od 3 dób" przelicza kwotę', /270,00/.test(s.body), s.body.slice(0, 420))

// --- one offer (no list step) ---
// A business that rents one thing never shows the list, so nothing but the
// start can pick the offer: a bare kind=rental link, the fork and "Nowa
// rezerwacja" must all land on its calendar, for a pool and for one instance.
await page.goto(URL + '?oneRental=7&prefillKind=rental'); await page.waitForTimeout(1200)
s = await state()
ok('jedna pula: kind=rental od razu kalendarz toru',
   s.krok === 'KROK 1 Z 2' && s.stepName === 'WYBÓR TERMINU' && /Przydzielimy wolny egzemplarz na wybrany termin\./.test(s.body) && /Ile osób\?/.test(s.body),
   `${s.krok} | ${s.stepName} | ${s.body.slice(0, 200)}`)
await page.goto(URL + '?oneRental=8&prefillKind=rental'); await page.waitForTimeout(1200)
s = await state()
ok('jeden egzemplarz: kind=rental od razu kalendarz przyczepy',
   s.stepName === 'WYBÓR TERMINU' && /Na jak długo\?/.test(s.body) && /1 doba/.test(s.body),
   `${s.stepName} | ${s.body.slice(0, 200)}`)
// Next to services the one offer is not a prefill: the fork still asks first.
await page.goto(URL + '?oneRental=7&signedIn=1'); await page.waitForTimeout(1200)
s = await state()
ok('jedna pula obok usług: widelec zostaje', /Wynajem/.test(s.body) && s.stepName !== 'WYBÓR TERMINU', `${s.stepName} | ${s.body.slice(0, 160)}`)
await clickByText('Wynajem'); await page.waitForTimeout(800)
s = await state()
ok('jedna pula z widelca: kalendarz toru', s.stepName === 'WYBÓR TERMINU' && /Ile osób\?/.test(s.body), `${s.stepName} | ${s.body.slice(0, 200)}`)
await clickByText('11:00'); await page.waitForTimeout(400)
await next(); await page.waitForTimeout(1600)
s = await state()
ok('jedna pula: rezerwacja toru', /Zarezerwowane!/.test(s.body), s.body.slice(0, 200))
await clickByText('Nowa rezerwacja'); await page.waitForTimeout(500)
await clickByText('Wynajem'); await page.waitForTimeout(800)
s = await state()
ok('jedna pula po "Nowa rezerwacja": znowu kalendarz toru', s.stepName === 'WYBÓR TERMINU' && /Ile osób\?/.test(s.body), `${s.stepName} | ${s.body.slice(0, 200)}`)

// A day and an hour picked for a visit are not the lane's: the visit keys its
// hour in UTC, the lane reads it as a wall clock, so a carried hour lit a tile an
// hour off and unlocked "Dalej" for an hour never picked there. Switching
// families starts the other family's term from scratch, both ways.
await page.goto(URL + '?oneRental=7'); await page.waitForTimeout(1000)
await toServices()
await addService('Golenie brzytwą'); await page.waitForTimeout(250)
await closeConfigure()
await next(); await page.waitForTimeout(900)
await pickTerm()
s = await state()
ok('wizyta przed zmianą rodziny: godzina wybrana', s.stepName === 'WYBÓR TERMINU' && !s.ctaDisabled && (await pickedSlots()).length === 1, `${s.stepName} | ${s.ctaText}`)
await back(); await page.waitForTimeout(300)
await back(); await page.waitForTimeout(300)
await clickByText('Wynajem'); await page.waitForTimeout(1200)
s = await state()
let picked = await pickedSlots()
ok('jedna pula po wizycie: kalendarz bez godziny z wizyty, Dalej zamknięte',
   s.stepName === 'WYBÓR TERMINU' && /Ile osób\?/.test(s.body) && s.ctaDisabled && picked.length === 0,
   `${s.stepName} | ${s.ctaDisabled} | ${picked.join(',')} | ${s.body.slice(0, 200)}`)
await clickByText('11:00'); await page.waitForTimeout(400)
await back(); await page.waitForTimeout(300)
await clickByText('Wizyta indywidualna'); await page.waitForTimeout(400)
await next(); await page.waitForTimeout(900)
s = await state()
picked = await pickedSlots()
ok('wizyta po wynajmie: termin bez godziny z wynajmu, Dalej zamknięte',
   s.stepName === 'WYBÓR TERMINU' && s.ctaDisabled && picked.length === 0,
   `${s.stepName} | ${s.ctaDisabled} | ${picked.join(',')}`)

// Rentals next to tables only: the fork stands on the rental family (the first
// one), with its single offer picked from the start. The fork still reads nothing
// of that offer and its CTA names none, as in v1.16.0; the family's own calendar
// does both.
for (const one of [7, 8]) {
  await page.goto(URL + `?noServices=1&oneRental=${one}`); await page.waitForTimeout(1500)
  s = await state()
  let j = await journal()
  let cta = await ctaLines()
  ok(`wynajem obok stolików (${one}): widelec bez zapytań o wynajem`,
     s.krok === null && /Wynajem/.test(s.body) && /Stolik/.test(s.body) && j.rentalReads === 0,
     `${s.krok} | ${j.rentalReads} | ${s.body.slice(0, 160)}`)
  ok(`wynajem obok stolików (${one}): CTA widelca bez oferty`, cta.svc === null && cta.meta === 'Wybierz, co chcesz zarezerwować', JSON.stringify(cta))
  await clickByText('Wynajem'); await page.waitForTimeout(1200)
  s = await state()
  j = await journal()
  ok(`wynajem obok stolików (${one}): z widelca kalendarz oferty`,
     s.stepName === 'WYBÓR TERMINU' && (one === 7 ? /Ile osób\?/ : /Na jak długo\?/).test(s.body) && j.rentalReads > 0,
     `${s.stepName} | ${j.rentalReads} | ${s.body.slice(0, 200)}`)
  await back(); await page.waitForTimeout(800)
  s = await state()
  cta = await ctaLines()
  ok(`wynajem obok stolików (${one}): z powrotem na widelcu CTA bez oferty`,
     s.krok === null && /Stolik/.test(s.body) && cta.svc === null && cta.meta === 'Wybierz, co chcesz zarezerwować', JSON.stringify(cta))
  // Into the table family and back to the rental one: its calendar again.
  await clickByText('Stolik'); await page.waitForTimeout(600)
  await back(); await page.waitForTimeout(300)
  await clickByText('Wynajem'); await page.waitForTimeout(1200)
  s = await state()
  ok(`wynajem obok stolików (${one}): po stolikach znowu kalendarz oferty`,
     s.stepName === 'WYBÓR TERMINU' && (one === 7 ? /Ile osób\?/ : /Na jak długo\?/).test(s.body), `${s.stepName} | ${s.body.slice(0, 200)}`)
}

// A business whose only family is one rental opens on its calendar: no fork,
// no list, and the CTA names the offer.
for (const one of [7, 8]) {
  await page.goto(URL + `?noServices=1&noTables=1&oneRental=${one}`); await page.waitForTimeout(1500)
  s = await state()
  const cta = await ctaLines()
  ok(`tylko jedna oferta wynajmu (${one}): od razu jej kalendarz`,
     s.krok === 'KROK 1 Z 2' && s.stepName === 'WYBÓR TERMINU' && (one === 7 ? /Ile osób\?/ : /Na jak długo\?/).test(s.body) && !!cta.svc,
     `${s.krok} | ${s.stepName} | ${JSON.stringify(cta)} | ${s.body.slice(0, 200)}`)
}

// ── 12. A single-family business shows NO fork (regression guard for barbershops).
await page.goto(URL + '?onlyServices=1')
await page.waitForTimeout(900)
s = await state()
ok('biznes tylko z usługami: brak widelca', s.stepName === 'WYBÓR USŁUGI', `${s.stepName}`)

// ── 13. Per-channel booking policy (#680). The widget books in channel 'widget';
//        what the business does not take there must not be offered, and a write
//        refused under the policy is the closed state, never "this term is gone".
await page.goto(URL + '?business=680')
await page.waitForTimeout(900)
s = await state()
ok('kanał wyłączony: stan zamknięty zamiast kroków', /Rezerwacje online są teraz wyłączone/.test(s.body) && s.krok === null, `${s.krok} | ${s.body.slice(0, 160)}`)
ok('kanał wyłączony: bez CTA "Dalej"', s.ctaText === null, `${s.ctaText}`)
ok('kanał wyłączony: odsyła do kontaktu z firmą', /skontaktuj się bezpośrednio z firmą/.test(s.body), s.body.slice(0, 200))

await page.goto(URL + '?business=681')
await page.waitForTimeout(900)
s = await state()
ok('zajęcia wyłączone w kanale: widelec bez zajęć', /Wizyta indywidualna/.test(s.body) && /Wynajem/.test(s.body) && !/Zajęcia grupowe/.test(s.body), s.body.slice(0, 200))

await page.goto(URL + '?business=681&prefillClass=41')
await page.waitForTimeout(900)
s = await state()
ok('prefill zamkniętych zajęć: stan zamknięty tej rodziny', /Zapisy na zajęcia online są teraz wyłączone/.test(s.body), s.body.slice(0, 200))
ok('prefill zamkniętych zajęć: wyjście do pozostałych rodzin', await clickByText('Wybierz, co zarezerwować'))
await page.waitForTimeout(500)
s = await state()
ok('wyjście prowadzi na widelec otwartych rodzin', /Wizyta indywidualna/.test(s.body) && !/Zajęcia grupowe/.test(s.body), s.body.slice(0, 200))

// 682: the profile says open; the write answers 409 CHANNEL_BOOKING_DISABLED
// (the owner switched the whole channel off after the page loaded).
await page.goto(URL + '?business=682&signedIn=1')
await page.waitForTimeout(900)
await toServices()
await addService('Golenie brzytwą'); await page.waitForTimeout(250)
await closeConfigure()
await next(); await page.waitForTimeout(1200)
s = await state()
ok('682: dochodzi do terminu', s.stepName === 'WYBÓR TERMINU', `${s.stepName}`)
await page.evaluate(() => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  host.shadowRoot.querySelector('.vz-day:not(.is-disabled)')?.click()
})
await page.waitForTimeout(900)
const slot = await page.evaluate(() => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  const b = [...host.shadowRoot.querySelectorAll('.vz-slot')].find((x) => !/:55/.test(x.textContent))
  if (!b) return null
  b.click()
  return b.textContent
})
await page.waitForTimeout(300)
ok('682: wybrano godzinę', !!slot, `${slot}`)
const events = []
await page.exposeFunction('__vzEvent', (t) => events.push(t)).catch(() => {})
await page.evaluate(() => window.VizytoBooking.on('*', (e) => window.__vzEvent(e.type)))
await next(); await page.waitForTimeout(1200)
s = await state()
ok('409 przy zapisie: stan zamknięty, nie "termin zniknął"', /Rezerwacje online są teraz wyłączone|Umawianie wizyt online jest teraz wyłączone/.test(s.body) && !/Ten termin właśnie zniknął/.test(s.body), s.body.slice(0, 200))
ok('409 przy zapisie: event channel_closed', events.includes('channel_closed'), events.join(','))
ok('409 przy zapisie: brak eventu slot_lost', !events.includes('slot_lost'), events.join(','))
// 682 switched the whole channel off: the profile re-read after the 409 says so,
// so nothing is offered as a way out, and a reopened flow starts closed instead
// of walking into the same 409 again.
ok('682: po ponownym odczycie profilu cały widget zamknięty',
   /Rezerwacje online są teraz wyłączone/.test(s.body) && !/Przejdź do|Wybierz, co zarezerwować/.test(s.body), s.body.slice(0, 200))
await page.evaluate(() => window.VizytoBooking.open({}))
await page.waitForTimeout(900)
s = await state()
ok('682: ponowne otwarcie startuje zamknięte, bez kroków', /Rezerwacje online są teraz wyłączone/.test(s.body) && s.krok === null, `${s.krok} | ${s.body.slice(0, 160)}`)

// 683 switches one action off: visits close, the rest stays, and a reopened flow
// forgets nothing (the fork no longer offers visits).
await page.goto(URL + '?business=683&signedIn=1')
await page.waitForTimeout(900)
await toServices()
await addService('Golenie brzytwą'); await page.waitForTimeout(250)
await closeConfigure()
await next(); await page.waitForTimeout(1200)
await page.evaluate(() => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  host.shadowRoot.querySelector('.vz-day:not(.is-disabled)')?.click()
})
await page.waitForTimeout(900)
await page.evaluate(() => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  ;[...host.shadowRoot.querySelectorAll('.vz-slot')].find((x) => !/:55/.test(x.textContent))?.click()
})
await page.waitForTimeout(300)
await next(); await page.waitForTimeout(1200)
s = await state()
ok('683: zamknięte tylko wizyty, wyjście do reszty', /Umawianie wizyt online jest teraz wyłączone/.test(s.body) && /Wybierz, co zarezerwować/.test(s.body), s.body.slice(0, 200))
await page.evaluate(() => window.VizytoBooking.open({}))
await page.waitForTimeout(900)
s = await state()
ok('683: ponowne otwarcie - widelec bez wizyt', !/Wizyta indywidualna/.test(s.body) && /Zajęcia grupowe/.test(s.body) && /Wynajem/.test(s.body), s.body.slice(0, 200))

// ── 14. Loyalty rewards (#471 F37). 471 = Points, 472 = stamps, 24 = no program.
/** What has keyboard focus inside the widget (null = it fell out to the page). */
const focused = () => page.evaluate(() => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  const a = host.shadowRoot.activeElement
  if (!a) return null
  return {
    role: a.getAttribute('role'),
    label: a.getAttribute('aria-label'),
    checked: a.getAttribute('aria-checked'),
    inConfirm: !!a.closest('.vz-rw-confirm'),
    cls: a.className || '',
    text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
  }
})
const fmt = (f) => (f ? `${f.role ?? ''}|${f.label ?? ''}|${f.cls}|${f.text}` : 'null')
let f
/** A create input with no reward: the v1.16.0 request (tests/loyalty.test.js pins its bytes). */
const noReward = (input) => input?.reward == null && !['rewardSelection', 'discountChoice', 'pricingToken'].some((k) => k in input)
/**
 * Watches every frame from now on and keeps the first one that shows the
 * success screen: whether its program block and the card's progress were
 * already there (nothing may push "Gotowe" down after that frame).
 */
const watchDoneFrame = () => page.evaluate(() => {
  window.__doneFrame = null
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  const tick = () => {
    const r = host.shadowRoot
    if (r.querySelector('.vz-done')) {
      window.__doneFrame = { block: !!r.querySelector('.vz-lp'), progress: !!r.querySelector('.vz-lp-progress') }
      return
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const doneFrame = () => page.evaluate(() => window.__doneFrame)
/** A keyboard press on a button in the reward step: it has focus first, as from Tab. */
const pressRewardButton = (sel, text) => page.evaluate(({ sel, text }) => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  const b = [...host.shadowRoot.querySelectorAll(sel)].find((x) => x.textContent.includes(text) || (x.getAttribute('aria-label') || '').includes(text))
  if (!b) return false
  b.focus()
  b.click()
  return true
}, { sel, text })
/** A haircut with its day and hour picked, one "Dalej" before the booking. */
const haircutToTerm = async (query) => {
  await page.goto(URL + query); await page.waitForTimeout(1000)
  await toServices()
  await addService('Strzyżenie'); await page.waitForTimeout(300)
  await closeConfigure()
  await next(); await page.waitForTimeout(800)
  if ((await state()).stepName === 'WYBÓR SPECJALISTY') { await clickByText('Bez preferencji'); await page.waitForTimeout(250); await next(); await page.waitForTimeout(900) }
  await pickTerm()
}
const haircutToReward = async (query) => {
  await haircutToTerm(query)
  await next(); await page.waitForTimeout(2200)
}

await haircutToReward('?business=471&signedIn=1')
s = await state()
ok('lojalność: krok Nagroda po terminie (sesja z hosta)', s.title === 'Nagroda', `${s.title} | ${s.body.slice(0, 200)}`)
// A sub-step of the last step: its number, but its own name - this customer never saw "Twoje dane".
ok('lojalność: pasek postępu nazywa krok NAGRODA', s.stepName === 'NAGRODA' && /^KROK (\d+) Z \1$/.test(s.krok ?? ''), `${s.krok} | ${s.stepName}`)
ok('lojalność: postęp klienta', /Punkty: 120/.test(s.body) && /Do poziomu Złoty: 30/.test(s.body), s.body.slice(0, 300))
ok('lojalność: obecna cena i ceny z nagrodą', /Obecna cena: 50,00/.test(s.body) && /Z nagrodą: 30,00/.test(s.body) && /Z nagrodą: bezpłatnie/.test(s.body), s.body.slice(0, 500))
ok('lojalność: nagroda z katalogu do odebrania', /Do odebrania za Punkty/.test(s.body) && /Koszt: 100/.test(s.body) && !/Rabat 25%/.test(s.body), s.body.slice(0, 700))
ok('lojalność: CTA Rezerwuję', s.ctaText === 'Rezerwuję' && !s.ctaDisabled, `${s.ctaText}`)

await pressRewardButton('.vz-rw-claim button', 'Odbierz: Rabat 10%'); await page.waitForTimeout(400)
s = await state()
ok('lojalność: potwierdzenie odbioru w miejscu', /Saldo po odebraniu/.test(s.body) && /Anuluj/.test(s.body), s.body.slice(0, 900))
// Focus never falls out to the page when the control that had it goes away.
f = await focused()
ok('lojalność: fokus na tytule potwierdzenia', !!f?.inConfirm && /vz-rw-confirm-title/.test(f.cls), fmt(f))
await pressRewardButton('.vz-rw-confirm button', 'Anuluj'); await page.waitForTimeout(300)
f = await focused()
ok('lojalność: Anuluj oddaje fokus na Odbierz w wierszu', f?.label === 'Odbierz: Rabat 10%', fmt(f))
await pressRewardButton('.vz-rw-claim button', 'Odbierz: Rabat 10%'); await page.waitForTimeout(400)
await pressRewardButton('.vz-rw-confirm button', 'Odbierz')
await page.waitForTimeout(2200)
s = await state()
ok('lojalność: odebrana nagroda wybrana z ceną', /Nagroda odebrana/.test(s.body) && /Punkty: 20/.test(s.body) && /Rabat 10%\. Do zapłaty: 45,00/.test(s.body), s.body.slice(0, 700))
f = await focused()
ok('lojalność: po odebraniu fokus na wybranej nagrodzie', f?.role === 'radio' && f.checked === 'true' && /Rabat 10%/.test(f.text), fmt(f))
await watchDoneFrame()
await page.evaluate(() => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  host.shadowRoot.querySelector('.vz-cta button')?.click()
})
await page.waitForTimeout(1800)
s = await state()
ok('lojalność: potwierdzenie z nagrodą i blokiem programu', /Zarezerwowane!/.test(s.body) && /NagrodaRabat 10%/.test(s.body) && /Program lojalnościowy/.test(s.body) && /Jak to działa/.test(s.body), s.body.slice(0, 700))
const frame = await doneFrame()
ok('lojalność: blok programu z postępem od pierwszej klatki potwierdzenia', !!frame?.block && !!frame?.progress && /Punkty: 20/.test(s.body), `${JSON.stringify(frame)} | ${s.body.slice(0, 700)}`)
ok('lojalność: bez obietnicy Punktów za rezerwację', !/otrzymasz|dostaniesz \d+ Punkt/i.test(s.body), s.body.slice(0, 700))

// A reward taken by another booking meanwhile: back on the step, price without it.
await haircutToReward('?business=471&signedIn=1')
await clickByText('Rabat 15 zł'); await page.waitForTimeout(300)
await page.evaluate(() => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  host.shadowRoot.querySelector('.vz-cta button')?.click()
})
await page.waitForTimeout(2600)
s = await state()
ok('lojalność: REWARD_UNAVAILABLE wraca na krok z wyjaśnieniem', s.title === 'Nagroda' && /Ta nagroda jest już niedostępna/.test(s.body) && !/Rabat 15 zł/.test(s.body), s.body.slice(0, 500))

// A promotion that started after the quote: the create-time conflict.
await page.goto(URL + '?business=471&signedIn=1&prefillRentalType=7'); await page.waitForTimeout(1200)
await clickByText('18:00'); await page.waitForTimeout(400)
await next(); await page.waitForTimeout(2200)
await clickByText('Rabat 20 zł'); await page.waitForTimeout(300)
await page.evaluate(() => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  host.shadowRoot.querySelector('.vz-cta button')?.click()
})
await page.waitForTimeout(2600)
s = await state()
ok('lojalność: konflikt z promocją przy zapisie wynajmu', /Ta nagroda nie łączy się z promocją/.test(s.body) && /Niedostępna/.test(s.body) && /Użyjesz jej przy wynajmie bez promocji/.test(s.body), s.body.slice(0, 700))

// A class entry: the expired token with the same total retries silently.
await page.goto(URL + '?business=471&signedIn=1&prefillSession=912'); await page.waitForTimeout(1500)
await next(); await page.waitForTimeout(2400)
s = await state()
ok('lojalność: zajęcia - CTA Zapisuję się', s.title === 'Nagroda' && s.ctaText === 'Zapisuję się', `${s.title} | ${s.ctaText}`)
await clickByText('Rabat 20 zł'); await page.waitForTimeout(300)
await page.evaluate(() => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  host.shadowRoot.querySelector('.vz-cta button')?.click()
})
await page.waitForTimeout(2800)
s = await state()
ok('lojalność: wygasła wycena - ciche ponowienie', /Zapisano!/.test(s.body) && /20,00/.test(s.body), s.body.slice(0, 400))

// A price that failed: "Spróbuj ponownie" goes with the failure, the card keeps focus.
await haircutToReward('?business=471&signedIn=1&failRewardQuote=4701')
s = await state()
ok('lojalność: nieudana wycena nagrody', /Nie udało się policzyć ceny z nagrodą/.test(s.body) && /Spróbuj ponownie/.test(s.body), s.body.slice(0, 600))
await pressRewardButton('.vz-rw-fail button', 'Spróbuj ponownie'); await page.waitForTimeout(100)
f = await focused()
ok('lojalność: Spróbuj ponownie oddaje fokus karcie nagrody', f?.role === 'radio' && /Rabat 20 zł/.test(f.text), fmt(f))
await page.waitForTimeout(900)
s = await state()
f = await focused()
ok('lojalność: ponowiona wycena z ceną, fokus zostaje', !/Nie udało się policzyć/.test(s.body) && /Z nagrodą: 30,00/.test(s.body) && f?.role === 'radio' && /Rabat 20 zł/.test(f.text), `${fmt(f)} | ${s.body.slice(0, 400)}`)

// A claim the API refuses and closes: focus goes back to the entry's "Odbierz".
await haircutToReward('?business=471&signedIn=1&claimRefusal=REWARD_CLAIM_LIMIT')
await pressRewardButton('.vz-rw-claim button', 'Odbierz: Rabat 10%'); await page.waitForTimeout(400)
await pressRewardButton('.vz-rw-confirm button', 'Odbierz'); await page.waitForTimeout(1600)
s = await state()
f = await focused()
ok('lojalność: odmowa zamykająca odbiór - fokus na Odbierz w wierszu', !/Saldo po odebraniu/.test(s.body) && f?.label === 'Odbierz: Rabat 10%', `${fmt(f)} | ${s.body.slice(0, 500)}`)

// A refusal that keeps the confirmation open: its own "Odbierz" gets focus back.
await haircutToReward('?business=471&signedIn=1&claimRefusal=NETWORK')
await pressRewardButton('.vz-rw-claim button', 'Odbierz: Rabat 10%'); await page.waitForTimeout(400)
await pressRewardButton('.vz-rw-confirm button', 'Odbierz'); await page.waitForTimeout(1600)
s = await state()
f = await focused()
ok('lojalność: odmowa bez zamknięcia - fokus wraca na Odbierz w potwierdzeniu', /Brak połączenia/.test(s.body) && /Saldo po odebraniu/.test(s.body) && !!f?.inConfirm && /Odbierz/.test(f.text) && !/ghost/.test(f.cls), `${fmt(f)} | ${s.body.slice(0, 500)}`)
// Enter again on that same button: the claim goes through and the card takes focus.
await page.keyboard.press('Enter'); await page.waitForTimeout(2200)
s = await state()
f = await focused()
ok('lojalność: ponowny odbiór z klawiatury - fokus na wybranej nagrodzie', /Nagroda odebrana/.test(s.body) && !/Brak połączenia/.test(s.body) && f?.role === 'radio' && f.checked === 'true' && /Rabat 10%/.test(f.text), `${fmt(f)} | ${s.body.slice(0, 400)}`)

// Stamps wording.
await haircutToReward('?business=472&signedIn=1')
s = await state()
ok('lojalność: karta z pieczątkami', /Nagroda gotowa/.test(s.body) && /Do odebrania za pieczątki/.test(s.body) && /Pieczątki: 5/.test(s.body) && /Pieczątki na koncie: 9/.test(s.body), s.body.slice(0, 600))

// No program: the booking goes straight through, as before.
await haircutToReward('?signedIn=1')
s = await state()
ok('lojalność: biznes bez programu rezerwuje bez kroku', /Zarezerwowane!/.test(s.body) && !/Program lojalnościowy/.test(s.body), s.body.slice(0, 300))
let j = await journal()
ok('lojalność: bez programu wizyta bez pól nagrody', j.lastCreate?.flow === 'appointment' && noReward(j.lastCreate.input), JSON.stringify(j.lastCreate))
ok('lojalność: bez programu jedno zapytanie o program na rezerwację', j.loyaltyReads === 1, `${j.loyaltyReads}`)

// An inline embed that opens on its last select step (a single rentable, a term,
// a pool prefill): a visitor who only looks, or even picks an hour, makes no
// loyalty request, also where the business has a program.
for (const query of ['?prefillRentalType=7', '?prefillSession=901', '?business=471&prefillSession=912', '?business=471&signedIn=1&prefillRentalType=7']) {
  await page.goto(URL + query); await page.waitForTimeout(1400)
  j = await journal()
  ok(`lojalność: oglądanie bez zapytania o program (${query})`, j.loyaltyReads === 0, `${j.loyaltyReads}`)
}
await clickByText('18:00'); await page.waitForTimeout(600)
j = await journal()
ok('lojalność: wybrana godzina bez Dalej nie pyta o program', j.loyaltyReads === 0, `${j.loyaltyReads}`)

// A guest asks for it once, on the details step, so it is ready after the SMS code.
await page.goto(URL + '?business=471&prefillSession=912'); await page.waitForTimeout(1400)
await next(); await page.waitForTimeout(500)
s = await state()
j = await journal()
ok('lojalność: dane klienta pytają o program raz', s.stepName === 'TWOJE DANE' && j.loyaltyReads === 1, `${s.stepName} | ${j.loyaltyReads}`)

// A signed-in "Dalej" reads the program first: the term locks at the tap, under a
// spinner, so a later tap cannot change what is booked (the mock answers in 120 ms).
for (const [query, label] of [['?signedIn=1&prefillSession=901', 'bez programu'], ['?business=471&signedIn=1&prefillSession=912', 'z programem']]) {
  await page.goto(URL + query); await page.waitForTimeout(1400)
  await next(); await page.waitForTimeout(40)
  const locked = await page.evaluate(() => {
    const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
    const r = host.shadowRoot
    return { sessions: !!r.querySelector('.vz-sessions'), spinner: !!r.querySelector('.vz-spin') }
  })
  ok(`lojalność: Dalej blokuje termin od razu (${label})`, !locked.sessions && locked.spinner, JSON.stringify(locked))
}
await page.goto(URL + '?signedIn=1&prefillSession=901'); await page.waitForTimeout(1400)
await next(); await page.waitForTimeout(1800)
s = await state()
j = await journal()
ok('lojalność: bez programu zapis na zajęcia bez pól nagrody', /Zapisano!/.test(s.body) && j.lastCreate?.flow === 'class' && noReward(j.lastCreate.input), `${JSON.stringify(j.lastCreate)} | ${s.body.slice(0, 200)}`)
await page.goto(URL + '?signedIn=1&prefillRentalType=7'); await page.waitForTimeout(1400)
await clickByText('18:00'); await page.waitForTimeout(500)
await next(); await page.waitForTimeout(1800)
s = await state()
j = await journal()
ok('lojalność: bez programu wynajem bez pól nagrody', /Zarezerwowane!/.test(s.body) && j.lastCreate?.flow === 'rental' && noReward(j.lastCreate.input), `${JSON.stringify(j.lastCreate)} | ${s.body.slice(0, 200)}`)

// A loyalty read that does not answer in time never holds the booking on its
// spinner (it has no way back): after its wait the booking goes out as without a
// program, and the late answer (the mock's 6 s, past every wait) changes nothing.
for (const [slow, query, done, flow] of [
  ['program', '?business=471&signedIn=1', /Zarezerwowane!/, 'appointment'],
  ['card', '?business=471&signedIn=1', /Zarezerwowane!/, 'appointment'],
  ['price', '?business=471&signedIn=1', /Zarezerwowane!/, 'appointment'],
  ['entry', '?business=471&signedIn=1&prefillSession=912', /Zapisano!/, 'class'],
]) {
  if (flow === 'class') { await page.goto(URL + `${query}&slowLoyalty=${slow}`); await page.waitForTimeout(1500) }
  else await haircutToTerm(`${query}&slowLoyalty=${slow}`)
  const tapped = Date.now()
  await next()
  s = await waitForText(done, 7000)
  const took = Date.now() - tapped
  j = await journal()
  ok(`lojalność: odczyt bez odpowiedzi (${slow}) - rezerwacja bez nagrody`,
     done.test(s.body) && j.lastCreate?.flow === flow && noReward(j.lastCreate.input) && took < 5500,
     `${took} ms | ${JSON.stringify(j.lastCreate)} | ${s.body.slice(0, 200)}`)
  await page.waitForTimeout(6500)
  s = await state()
  ok(`lojalność: spóźniona odpowiedź (${slow}) niczego nie zmienia`, done.test(s.body) && s.title !== 'Nagroda', `${s.title} | ${s.body.slice(0, 200)}`)
}

// A loyalty answer the reward step cannot read (a class entry's line, a reward
// without its terms): the booking goes on without the step, not on a spinner.
for (const [broken, query, done, flow] of [
  ['entry', '?business=471&signedIn=1&prefillSession=912', /Zapisano!/, 'class'],
  ['reward', '?business=471&signedIn=1', /Zarezerwowane!/, 'appointment'],
]) {
  if (flow === 'class') { await page.goto(URL + `${query}&brokenLoyalty=${broken}`); await page.waitForTimeout(1500) }
  else await haircutToTerm(`${query}&brokenLoyalty=${broken}`)
  await next()
  s = await waitForText(done, 5000)
  j = await journal()
  ok(`lojalność: nieczytelna odpowiedź (${broken}) - rezerwacja bez kroku Nagroda`,
     done.test(s.body) && j.lastCreate?.flow === flow && noReward(j.lastCreate.input),
     `${JSON.stringify(j.lastCreate)} | ${s.body.slice(0, 200)}`)
}

// The reads made on the "Nagroda" step itself are bounded too (src/loyalty.ts):
// the step shows first, then a reread of the card or a price asked again does not
// answer in time (the mock's 6 s). After the 3 s wait nothing in the step is busy:
// a price reads as failed with "Spróbuj ponownie", a reread keeps what the step had.
/** Skeletons, spinners and busy controls in the widget right now. */
const busyCount = () => page.evaluate(() => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  return host.shadowRoot.querySelectorAll('.vz-skel, .vz-spin, [aria-busy="true"]').length
})
/** Polls until nothing is busy or `ms` pass; how long that took. */
const waitIdle = async (ms) => {
  const start = Date.now()
  while (Date.now() - start < ms && (await busyCount()) > 0) await page.waitForTimeout(150)
  return Date.now() - start
}
const clickCta = () => page.evaluate(() => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  host.shadowRoot.querySelector('.vz-cta button')?.click()
})
let took

// "Spróbuj ponownie" on a failed price, and the second try stalls.
await haircutToReward('?business=471&signedIn=1&failRewardQuote=4701&slowLoyalty=reprice')
s = await state()
ok('krok Nagroda: nieudana wycena z ponowieniem', s.title === 'Nagroda' && /Nie udało się policzyć ceny z nagrodą/.test(s.body), s.body.slice(0, 400))
await pressRewardButton('.vz-rw-fail button', 'Spróbuj ponownie'); await page.waitForTimeout(400)
ok('krok Nagroda: ponowiona wycena czeka', (await busyCount()) > 0, `${await busyCount()}`)
took = await waitIdle(6000)
s = await state()
ok('krok Nagroda: ponowiona wycena bez odpowiedzi - znów "Spróbuj ponownie", nic nie czeka',
   took < 4500 && (await busyCount()) === 0 && /Nie udało się policzyć ceny z nagrodą/.test(s.body) && /Spróbuj ponownie/.test(s.body) && s.ctaText === 'Rezerwuję' && !s.ctaDisabled,
   `${took} ms | ${s.ctaText} ${s.ctaDisabled} | ${s.body.slice(0, 400)}`)
await page.waitForTimeout(3500)
s = await state()
ok('krok Nagroda: spóźniona wycena niczego nie zmienia', (await busyCount()) === 0 && /Nie udało się policzyć ceny z nagrodą/.test(s.body), s.body.slice(0, 400))

// A claim whose reread of the card stalls: the reward is still chosen, "Odbierz" lets go.
await haircutToReward('?business=471&signedIn=1&slowLoyalty=reread')
await pressRewardButton('.vz-rw-claim button', 'Odbierz: Rabat 10%'); await page.waitForTimeout(400)
await pressRewardButton('.vz-rw-confirm button', 'Odbierz'); await page.waitForTimeout(1000)
ok('krok Nagroda: odbiór czeka na odczyt karty', (await busyCount()) > 0, `${await busyCount()}`)
took = await waitIdle(6000)
s = await state()
ok('krok Nagroda: odczyt karty po odbiorze bez odpowiedzi - nagroda wybrana, nic nie czeka',
   took < 4000 && (await busyCount()) === 0 && /Nagroda odebrana/.test(s.body) && /Rabat 10%\. Do zapłaty: 45,00/.test(s.body) && !/Saldo po odebraniu/.test(s.body) && !s.ctaDisabled,
   `${took} ms | ${s.body.slice(0, 500)}`)

// A create refused for the reward, and the reread of the card stalls: the step is
// ready again with the rewards it had, priced anew.
await haircutToReward('?business=471&signedIn=1&slowLoyalty=reread')
await clickByText('Rabat 15 zł'); await page.waitForTimeout(300)
await clickCta(); await page.waitForTimeout(1500)
s = await state()
ok('krok Nagroda: po odmowie zapisu odczyt karty czeka', s.title === 'Nagroda' && (await busyCount()) > 0, `${s.title} | ${s.body.slice(0, 300)}`)
took = await waitIdle(6000)
s = await state()
ok('krok Nagroda: odczyt karty po odmowie bez odpowiedzi - krok gotowy z cenami',
   took < 4000 && (await busyCount()) === 0 && s.title === 'Nagroda' && /Ta nagroda jest już niedostępna/.test(s.body) && /Z nagrodą: 30,00/.test(s.body) && !s.ctaDisabled,
   `${took} ms | ${s.body.slice(0, 500)}`)

// ── 15. Create refusals that are not about the term (parity with the monorepo's
//        bookingCreateErrors.ts and bookingErrorMessages.ts). ?createRefusal answers
//        the first create once, with the code's status (src/mock.ts).
const failures = []
await page.exposeFunction('__vzFailure', (t, reason) => failures.push({ t, reason })).catch(() => {})
const watchFailures = async () => {
  failures.length = 0
  await page.evaluate(() => window.VizytoBooking.on('*', (e) => window.__vzFailure(e.type, e.reason ?? null)))
}
const failedReasons = () => failures.filter((e) => e.t === 'booking_failed').map((e) => e.reason)
const lostSlot = () => failures.some((e) => e.t === 'slot_lost')

// A real lost slot still is one: the mock's :55 answers 409 SLOT_TAKEN.
await haircutToTerm('?signedIn=1')
const slot55 = await page.evaluate(() => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  const b = [...host.shadowRoot.querySelectorAll('.vz-slot')].find((x) => /:55/.test(x.textContent))
  if (!b) return null
  b.click()
  return b.textContent
})
await page.waitForTimeout(300)
await watchFailures()
await next()
s = await waitForText(/zniknął|Zarezerwowane/, 4000)
ok('zajęty termin (409 SLOT_TAKEN): nadal "Ten termin właśnie zniknął"', !!slot55 && /Ten termin właśnie zniknął/.test(s.body) && lostSlot(), `${slot55} | ${JSON.stringify(failures)} | ${s.body.slice(0, 200)}`)

// The whole business refuses a visit: the closed state, never a lost slot or the hours.
await haircutToTerm('?signedIn=1&createRefusal=BUSINESS_CLOSED')
await watchFailures()
await next()
s = await waitForText(/wyłączone|zniknął|Zarezerwowane/, 4000)
ok('wizyta, firma nie przyjmuje rezerwacji (409 BUSINESS_CLOSED): stan zamknięty, nie "termin zniknął"',
   /Rezerwacje online są teraz wyłączone/.test(s.body) && /zadzwoń do firmy|skontaktuj się bezpośrednio z firmą/.test(s.body) && !/Ten termin właśnie zniknął/.test(s.body) && s.krok === null,
   `${s.krok} | ${s.body.slice(0, 200)}`)
ok('wizyta, BUSINESS_CLOSED: booking_failed business_closed, bez slot_lost', failedReasons().includes('business_closed') && !lostSlot(), JSON.stringify(failures))

// A rental of a business without a serving plan: the same, not back to the calendar.
await page.goto(URL + '?signedIn=1&prefillRentalType=7&createRefusal=SUBSCRIPTION_REQUIRED'); await page.waitForTimeout(1400)
await watchFailures()
await clickByText('18:00'); await page.waitForTimeout(500)
await next()
s = await waitForText(/wyłączone|Zarezerwowane|Nie udało/, 4000)
ok('wynajem bez planu (402 SUBSCRIPTION_REQUIRED): stan zamknięty, nie kalendarz',
   /Rezerwacje online są teraz wyłączone/.test(s.body) && !/Nie udało się zarezerwować/.test(s.body) && s.krok === null && failedReasons().includes('business_closed'),
   `${s.krok} | ${JSON.stringify(failures)} | ${s.body.slice(0, 200)}`)

// A body without the API's code (a proxy's 502 page): the term stays, a retry and a way back.
await haircutToTerm('?signedIn=1&createRefusal=HTTP_502')
const pickedBefore = await pickedSlots()
await watchFailures()
await next()
s = await waitForText(/Nie udało|zniknął|Zarezerwowane/, 4000)
ok('wizyta, 502 bez kodu: komunikat z ponowieniem, termin zostaje',
   /Nie udało się zarezerwować wizyty\. Spróbuj ponownie\./.test(s.body) && /Spróbuj ponownie/.test(s.ctaText ?? s.body) && !/zniknął|Bad Gateway|HTTP_502/.test(s.body) && s.hasBack && failedReasons().includes('error') && !lostSlot(),
   `${s.hasBack} | ${JSON.stringify(failures)} | ${s.body.slice(0, 200)}`)
await back(); await page.waitForTimeout(500)
s = await state()
const pickedAfter = await pickedSlots()
ok('wizyta, 502: Wstecz wraca do terminu z wybraną godziną', s.stepName === 'WYBÓR TERMINU' && pickedAfter.length > 0 && pickedAfter.join() === pickedBefore.join() && !/Nie udało się/.test(s.body),
   `${s.stepName} | ${pickedBefore} -> ${pickedAfter}`)
await next()
s = await waitForText(/Zarezerwowane|Nie udało/, 4000)
ok('wizyta, 502: ponowne Dalej rezerwuje', /Zarezerwowane!/.test(s.body), s.body.slice(0, 200))

// The API's 500 envelope on a class entry: no English, no bounce to the timetable, the retry books.
await page.goto(URL + '?signedIn=1&prefillSession=901&createRefusal=SERVER_ERROR'); await page.waitForTimeout(1400)
await watchFailures()
await next()
s = await waitForText(/Nie udało|Zapisano/, 4000)
const onTimetable = await page.evaluate(() => {
  const host = [...document.querySelectorAll('#booking, #booking *')].find((e) => e.shadowRoot)
  return !!host.shadowRoot.querySelector('.vz-sessions')
})
ok('zajęcia, 500: komunikat z ponowieniem, bez tekstu API i bez powrotu do grafiku',
   /Nie udało się zapisać na zajęcia\. Spróbuj ponownie\./.test(s.body) && !/Internal server error/i.test(s.body) && !onTimetable && failedReasons().includes('error'),
   `${onTimetable} | ${JSON.stringify(failures)} | ${s.body.slice(0, 200)}`)
await clickByText('Spróbuj ponownie')
s = await waitForText(/Zapisano/, 4000)
ok('zajęcia, 500: Spróbuj ponownie zapisuje', /Zapisano!/.test(s.body), s.body.slice(0, 200))

// A visit refusal with another status (422) is not a lost slot either: the reason, the term kept.
await haircutToTerm('?signedIn=1&createRefusal=INCOMPLETE_PROFILE')
await watchFailures()
await next()
s = await waitForText(/Uzupełnij|zniknął|Zarezerwowane/, 4000)
ok('wizyta, 422 INCOMPLETE_PROFILE: powód zamiast "termin zniknął"',
   /Uzupełnij imię, nazwisko i numer telefonu, aby zarezerwować\./.test(s.body) && !/zniknął/.test(s.body) && failedReasons().includes('booking_refused') && !lostSlot(),
   `${JSON.stringify(failures)} | ${s.body.slice(0, 200)}`)

await browser.close()
console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)

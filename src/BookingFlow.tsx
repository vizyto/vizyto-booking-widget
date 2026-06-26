import { useEffect, useMemo, useState } from 'preact/hooks'
import type { Business, Cfg, DayCounts, Service, Slots } from './api'
import {
  createAppointment,
  formatDuration,
  formatPrice,
  getAvailability,
  getCounts,
  guestSignup,
  slotLabel,
  slotStartDate,
} from './api'

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function nextDays(n: number): string[] {
  const out: string[] = []
  const b = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(b)
    d.setDate(b.getDate() + i)
    out.push(ymd(d))
  }
  return out
}
const weekday = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pl-PL', { weekday: 'short' })
const dayMonth = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })

type ResChoice = number | 'any'
const STEPS = ['Usługa', 'Barber', 'Termin', 'Dane']

export function BookingFlow({
  cfg,
  business,
  initialServiceId,
}: {
  cfg: Cfg
  business: Business
  initialServiceId?: number
}) {
  const services = useMemo(() => business.services.filter((s) => s.bookingType !== 'group'), [business])
  const workers = useMemo(() => business.resources.filter((r) => r.type === 'worker'), [business])

  const [service, setService] = useState<Service | null>(() => services.find((s) => s.id === initialServiceId) ?? null)
  const [resource, setResource] = useState<ResChoice | null>(null)
  const [date, setDate] = useState('')
  const [slotKey, setSlotKey] = useState('')
  const [counts, setCounts] = useState<DayCounts>({})
  const [slots, setSlots] = useState<Slots>({})
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [contact, setContact] = useState({ firstName: '', lastName: '', phone: '', email: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const resourceId = resource === 'any' || resource == null ? undefined : resource
  const days = useMemo(() => nextDays(14), [])
  const step = done ? 4 : !service ? 0 : resource == null ? 1 : !slotKey ? 2 : 3

  useEffect(() => {
    if (!service) return
    let cancelled = false
    getCounts(cfg, { startDate: days[0], endDate: days[days.length - 1], businessServiceId: service.id, resourceId }).then(
      (x) => !cancelled && setCounts(x),
    )
    return () => {
      cancelled = true
    }
  }, [service?.id, resourceId])

  useEffect(() => {
    if (!service || !date) {
      setSlots({})
      return
    }
    let cancelled = false
    setLoadingSlots(true)
    getAvailability(cfg, { date, businessServiceId: service.id, resourceId })
      .then((x) => !cancelled && setSlots(x))
      .finally(() => !cancelled && setLoadingSlots(false))
    return () => {
      cancelled = true
    }
  }, [service?.id, resourceId, date])

  const slotKeys = useMemo(() => Object.keys(slots).filter((k) => (slots[k] ?? []).length > 0).sort(), [slots])
  const workerName =
    resource === 'any' || resource == null ? 'Dowolny barber' : workers.find((w) => w.id === resource)?.name ?? ''
  const canSubmit =
    !!contact.firstName.trim() &&
    !!contact.lastName.trim() &&
    contact.phone.trim().length >= 6 &&
    /.+@.+\..+/.test(contact.email)

  async function book() {
    if (!service || !date || !slotKey || submitting) return
    setSubmitting(true)
    setError('')
    const g = await guestSignup(cfg, {
      firstName: contact.firstName.trim(),
      lastName: contact.lastName.trim(),
      phone: contact.phone.trim(),
      email: contact.email.trim().toLowerCase(),
    })
    if (!g.ok) {
      setSubmitting(false)
      setError(
        g.code === 'EMAIL_IN_USE'
          ? 'Ten e-mail ma już konto Vizyto. Użyj innego adresu lub zaloguj się w aplikacji.'
          : 'Nie udało się rozpocząć rezerwacji. Spróbuj ponownie.',
      )
      return
    }
    const r = await createAppointment(
      cfg,
      { businessServiceId: service.id, startDate: slotStartDate(date, slotKey), bookedById: g.data.userId, resourceId },
      g.data.token,
    )
    setSubmitting(false)
    if (!r.ok) {
      setError(r.code === 'BOOKED_BY_MISMATCH' ? 'Sesja wygasła, odśwież stronę.' : 'Ten termin właśnie zniknął. Wybierz inny.')
      setSlotKey('')
      return
    }
    setDone(true)
  }

  const setC = (k: keyof typeof contact, v: string) => setContact((p) => ({ ...p, [k]: v }))

  if (done && service) {
    return (
      <div class="vz-done">
        <div class="vz-check">✓</div>
        <div style="font-size:20px;font-weight:600;">Zarezerwowane!</div>
        <div class="vz-muted" style="margin-top:6px;">Potwierdzenie wyślemy na {contact.email}.</div>
        <div class="vz-summary" style="text-align:left;margin:18px auto 0;max-width:300px;">
          <div class="vz-row"><span>Usługa</span><span>{service.name}</span></div>
          <div class="vz-row"><span>Barber</span><span>{workerName}</span></div>
          <div class="vz-row"><span>Termin</span><span>{dayMonth(date)}, {slotLabel(date, slotKey, business.timezone)}</span></div>
          <div class="vz-row"><span>Cena</span><span>{formatPrice(service.price)}</span></div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div class="vz-steps">
        {STEPS.map((label, i) => (
          <div class={`vz-step ${i < step ? 'done' : i === step ? 'active' : ''}`}>
            <span class="vz-dot">{i < step ? '✓' : i + 1}</span>
            {label}
            {i < STEPS.length - 1 && <span class="vz-sep" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div>
          <div class="vz-h">Wybierz usługę</div>
          <div class="vz-list">
            {services.map((s) => (
              <button class="vz-opt" onClick={() => setService(s)}>
                <span>
                  <span class="vz-opt-name">{s.name}</span>
                  <span class="vz-opt-meta">{formatDuration(s.duration)}</span>
                </span>
                <span class="vz-opt-price">{formatPrice(s.price)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && service && (
        <div>
          <div class="vz-h">
            <button class="vz-back" onClick={() => setService(null)}>‹</button>
            Wybierz barbera
          </div>
          <div class="vz-grid3">
            {workers.length > 1 && (
              <button class="vz-worker" onClick={() => setResource('any')}>
                <span class="vz-av">✂</span>
                <span class="vz-wn">Dowolny</span>
              </button>
            )}
            {workers.map((w) => (
              <button class="vz-worker" onClick={() => setResource(w.id)}>
                <span class="vz-av">{w.image ? <img src={w.image} alt={w.name} /> : w.name.charAt(0)}</span>
                <span class="vz-wn">{w.name}</span>
                {w.position && <span class="vz-wp">{w.position}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && service && (
        <div>
          <div class="vz-h">
            <button class="vz-back" onClick={() => setResource(null)}>‹</button>
            Wybierz termin
          </div>
          <div class="vz-days">
            {days.map((d) => {
              const free = (counts[d] ?? 0) > 0
              return (
                <button
                  class={`vz-day ${d === date ? 'active' : ''}`}
                  disabled={!free}
                  onClick={() => {
                    setDate(d)
                    setSlotKey('')
                  }}
                >
                  <small>{weekday(d)}</small>
                  {dayMonth(d)}
                  {free && <span class="vz-free" />}
                </button>
              )
            })}
          </div>
          {!date ? (
            <div class="vz-muted" style="margin-top:16px;">Wybierz dzień, aby zobaczyć godziny.</div>
          ) : loadingSlots ? (
            <div class="vz-center"><span class="vz-spin" /> Szukam wolnych godzin...</div>
          ) : slotKeys.length === 0 ? (
            <div class="vz-muted" style="margin-top:16px;">Brak wolnych godzin tego dnia. Wybierz inny.</div>
          ) : (
            <div class="vz-slots">
              {slotKeys.map((k) => (
                <button class="vz-slot" onClick={() => setSlotKey(k)}>
                  {slotLabel(date, k, business.timezone)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 3 && service && (
        <div>
          <div class="vz-h">
            <button class="vz-back" onClick={() => setSlotKey('')}>‹</button>
            Twoje dane
          </div>
          <div class="vz-summary">
            <div class="vz-row"><span>Usługa</span><span>{service.name}</span></div>
            <div class="vz-row"><span>Barber</span><span>{workerName}</span></div>
            <div class="vz-row"><span>Termin</span><span>{dayMonth(date)}, {slotLabel(date, slotKey, business.timezone)}</span></div>
            <div class="vz-row"><span>Cena</span><span>{formatPrice(service.price)}</span></div>
          </div>
          <div class="vz-fields">
            <input class="vz-input" placeholder="Imię" value={contact.firstName} onInput={(e) => setC('firstName', (e.target as HTMLInputElement).value)} />
            <input class="vz-input" placeholder="Nazwisko" value={contact.lastName} onInput={(e) => setC('lastName', (e.target as HTMLInputElement).value)} />
            <input class="vz-input full" type="tel" placeholder="Telefon" value={contact.phone} onInput={(e) => setC('phone', (e.target as HTMLInputElement).value)} />
            <input class="vz-input full" type="email" placeholder="E-mail" value={contact.email} onInput={(e) => setC('email', (e.target as HTMLInputElement).value)} />
          </div>
          {error && <div class="vz-err">{error}</div>}
          <button class="vz-btn" disabled={!canSubmit || submitting} onClick={book}>
            {submitting && <span class="vz-spin" />}
            {submitting ? 'Rezerwuję...' : `Rezerwuję - ${formatPrice(service.price)}`}
          </button>
          <div class="vz-note">Rezerwując akceptujesz kontakt w sprawie wizyty. Konto Vizyto nie jest wymagane.</div>
        </div>
      )}
    </div>
  )
}

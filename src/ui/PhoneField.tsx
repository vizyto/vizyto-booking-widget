import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { COUNTRIES, countryByIso, splitE164 } from '../data/countries'
import { ChevronRight, Search } from './icons'

// International phone input: a country-code selector ("kierunkowy") plus the
// national number. Mirrors the main Vizyto app's intl-tel-input field but stays
// dependency-free so the embed bundle stays small. Stores the value as E.164
// ("+48600700800") in the parent; the API normalizes authoritatively.
export function PhoneField({
  label,
  value,
  onChange,
  error,
}: {
  label: string
  value: string
  onChange: (e164: string) => void
  error?: string
}) {
  // Internal source of truth (recovered from the incoming value on mount).
  const initial = useMemo(() => splitE164(value), [])
  const [iso2, setIso2] = useState(initial.iso2)
  const [national, setNational] = useState(initial.national)
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const [query, setQuery] = useState('')

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const country = countryByIso(iso2)

  // The phone field often sits low in the (scrollable, clipped) dialog, so a
  // downward popover gets cut off. Flip it above the field when there isn't
  // room below.
  const toggleOpen = () => {
    setOpen((o) => {
      const next = !o
      if (next && rowRef.current) {
        const r = rowRef.current.getBoundingClientRect()
        setDropUp(window.innerHeight - r.bottom < 300)
      }
      return next
    })
  }

  const emit = (nextIso2: string, nextNational: string) => {
    const dial = countryByIso(nextIso2).dial
    onChange(`+${dial}${nextNational}`)
  }

  const onNational = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, '')
    setNational(digits)
    emit(iso2, digits)
  }
  const pick = (nextIso2: string) => {
    setIso2(nextIso2)
    setOpen(false)
    setQuery('')
    emit(nextIso2, national)
    inputRef.current?.focus()
  }

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      // composedPath (not e.target) so this works inside the widget's shadow
      // root — events get retargeted to the host at the document boundary,
      // which would otherwise read as an outside click on every interaction.
      if (wrapRef.current && !e.composedPath().includes(wrapRef.current)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const list = q
    ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.dial.includes(q.replace('+', '')))
    : COUNTRIES

  return (
    <div class="vz-field full" ref={wrapRef}>
      <label class="vz-label">{label}</label>
      <div class={`vz-phone${error ? ' invalid' : ''}${open ? ' open' : ''}`} ref={rowRef}>
        <button
          class="vz-phone-cc"
          type="button"
          onClick={toggleOpen}
          aria-haspopup="listbox"
          aria-expanded={open ? 'true' : 'false'}
          aria-label={`Kierunkowy: ${country.name} +${country.dial}`}
        >
          <span class="vz-flag">{country.flag}</span>
          <span class="vz-dial">+{country.dial}</span>
          <span class={`vz-cc-caret${open ? ' up' : ''}`}><ChevronRight size={14} /></span>
        </button>
        <input
          ref={inputRef}
          class="vz-phone-num"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="600 700 800"
          value={national}
          aria-invalid={error ? 'true' : undefined}
          onInput={(e) => onNational((e.target as HTMLInputElement).value)}
        />
      </div>

      {open && (
        <div class={`vz-cc-pop${dropUp ? ' up' : ''}`} role="listbox">
          <div class="vz-cc-search">
            <Search size={15} />
            <input
              class="vz-cc-search-input"
              type="text"
              placeholder="Szukaj kraju lub kierunkowego"
              value={query}
              autoFocus
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="vz-cc-list">
            {list.map((c) => (
              <button
                key={c.iso2}
                class={`vz-cc-item${c.iso2 === iso2 ? ' on' : ''}`}
                type="button"
                role="option"
                aria-selected={c.iso2 === iso2 ? 'true' : 'false'}
                onClick={() => pick(c.iso2)}
              >
                <span class="vz-flag">{c.flag}</span>
                <span class="vz-cc-name">{c.name}</span>
                <span class="vz-cc-dial">+{c.dial}</span>
              </button>
            ))}
            {!list.length && <div class="vz-cc-empty">Brak wyników</div>}
          </div>
        </div>
      )}

      {error && <span class="vz-field-err">{error}</span>}
    </div>
  )
}

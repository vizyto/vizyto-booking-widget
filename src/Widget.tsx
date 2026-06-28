import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { Business, Cfg } from './api'
import { fetchBusiness } from './api'
import { BookingFlow, type Auth } from './BookingFlow'
import { Spinner } from './ui/Spinner'
import { Powered } from './ui/Powered'
import { Calendar, Close } from './ui/icons'

// Minimal panel used only for the load / error states before the flow mounts.
function MiniPanel({ onClose, children }: { onClose?: () => void; children: ComponentChildren }) {
  return (
    <div class="vz-panel" role="dialog" aria-modal={onClose ? 'true' : undefined} aria-label="Zarezerwuj wizytę">
      {onClose && <span class="vz-grab" aria-hidden="true" />}
      <header class="vz-head">
        <span class="vz-head-spacer" />
        <div class="vz-title">Zarezerwuj wizytę</div>
        {onClose ? (
          <button class="vz-iconbtn" onClick={onClose} aria-label="Zamknij" type="button"><Close size={20} /></button>
        ) : (
          <span class="vz-head-spacer" />
        )}
      </header>
      <div class="vz-body">{children}</div>
      <Powered />
    </div>
  )
}

export function Widget({
  cfg,
  mode,
  label,
  preAuth,
}: {
  cfg: Cfg
  mode: 'launcher' | 'inline'
  label: string
  preAuth?: Auth
}) {
  const [open, setOpen] = useState(mode === 'inline')
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  async function load() {
    if (business || loading) return
    setLoading(true)
    setFailed(false)
    const b = await fetchBusiness(cfg)
    setLoading(false)
    if (!b) setFailed(true)
    else setBusiness(b)
  }

  useEffect(() => {
    if (open) load()
  }, [open])

  // Esc + body-scroll-lock + focus trap, while the modal is open (launcher only).
  useEffect(() => {
    if (mode !== 'launcher' || !open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key !== 'Tab' || !overlayRef.current) return
      const f = overlayRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      )
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      const root = overlayRef.current.getRootNode() as ShadowRoot
      if (e.shiftKey && root.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && root.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, mode])

  const close = mode === 'launcher' ? () => setOpen(false) : undefined

  const content = loading ? (
    <MiniPanel onClose={close}><div class="vz-center"><Spinner /> Wczytuję…</div></MiniPanel>
  ) : failed ? (
    <MiniPanel onClose={close}>
      <div class="vz-center" style="flex-direction:column;gap:14px;">
        <div>Nie udało się wczytać rezerwacji.</div>
        <button class="vz-btn" style="width:auto;" onClick={load} type="button">Spróbuj ponownie</button>
      </div>
    </MiniPanel>
  ) : business ? (
    <BookingFlow cfg={cfg} business={business} preAuth={preAuth} onClose={close} />
  ) : null

  if (mode === 'inline') return <div class="vz-inline">{content}</div>

  return (
    <>
      <button class="vz-launcher" onClick={() => setOpen(true)} type="button">
        <Calendar size={18} />
        {label}
      </button>
      {open && (
        <div
          class="vz-overlay"
          ref={overlayRef}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          {content}
        </div>
      )}
    </>
  )
}

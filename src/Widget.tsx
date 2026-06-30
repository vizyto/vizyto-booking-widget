import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { Business, Cfg } from './api'
import { fetchBusiness } from './api'
import { BookingFlow, type Auth, type Prefill } from './BookingFlow'
import { noopEmit, type EmitFn } from './events'
import { Spinner } from './ui/Spinner'
import { Powered } from './ui/Powered'
import { Calendar, Close } from './ui/icons'

// Lets a host page open/close the modal programmatically (VizytoBooking.open()).
export type WidgetController = { open?: (p?: Prefill) => void; close?: () => void }

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
  showLauncher = true,
  controller,
  emit = noopEmit,
}: {
  cfg: Cfg
  mode: 'launcher' | 'inline'
  label: string
  preAuth?: Auth
  showLauncher?: boolean
  controller?: WidgetController
  emit?: EmitFn
}) {
  const [open, setOpen] = useState(mode === 'inline')
  const [prefill, setPrefill] = useState<Prefill | undefined>(undefined)
  const [sessionId, setSessionId] = useState(0) // bump to remount the flow fresh per open
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const openSource = useRef<string>('launcher') // why the modal last opened - attached to the 'open' event
  const wasOpen = useRef(open) // for emitting open/close only on real transitions

  async function load() {
    if (business || loading) return
    setLoading(true)
    setFailed(false)
    const b = await fetchBusiness(cfg)
    setLoading(false)
    if (!b) setFailed(true)
    else {
      setBusiness(b)
      emit('ready', { mode })
    }
  }

  useEffect(() => {
    if (open) load()
  }, [open])

  // Emit open/close on real transitions (launcher only - inline is always open).
  useEffect(() => {
    if (mode !== 'launcher' || open === wasOpen.current) return
    wasOpen.current = open
    emit(open ? 'open' : 'close', open ? { source: openSource.current } : undefined)
  }, [open, mode])

  // Expose open/close to the host (VizytoBooking.open / .close).
  useEffect(() => {
    if (!controller || mode !== 'launcher') return
    controller.open = (p) => {
      setPrefill(p)
      setSessionId((s) => s + 1)
      openSource.current = 'api'
      setOpen(true)
    }
    controller.close = () => setOpen(false)
  }, [controller, mode])

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
    <BookingFlow key={sessionId} cfg={cfg} business={business} prefill={prefill} preAuth={preAuth} onClose={close} emit={emit} />
  ) : null

  if (mode === 'inline') return <div class="vz-inline">{content}</div>

  return (
    <>
      {showLauncher && (
        <button class="vz-launcher" onClick={() => { openSource.current = 'launcher'; setOpen(true) }} type="button">
          <Calendar size={18} />
          {label}
        </button>
      )}
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

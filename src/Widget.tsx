import { useEffect, useState } from 'preact/hooks'
import type { Business, Cfg } from './api'
import { fetchBusiness } from './api'
import { BookingFlow } from './BookingFlow'

export function Widget({ cfg, mode, label }: { cfg: Cfg; mode: 'launcher' | 'inline'; label: string }) {
  const [open, setOpen] = useState(mode === 'inline')
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

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

  useEffect(() => {
    if (mode !== 'launcher' || !open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, mode])

  const panel = (
    <div class="vz-panel">
      <div class="vz-head">
        <div>
          <div class="vz-title">{business?.name || 'Rezerwacja wizyty'}</div>
          <div class="vz-sub">Umów się online</div>
        </div>
        {mode === 'launcher' && (
          <button class="vz-close" onClick={() => setOpen(false)} aria-label="Zamknij">
            ×
          </button>
        )}
      </div>
      <div class="vz-body">
        {loading && (
          <div class="vz-center">
            <span class="vz-spin" /> Wczytuję...
          </div>
        )}
        {failed && !loading && (
          <div class="vz-center" style="flex-direction:column;">
            <div>Nie udało się wczytać rezerwacji.</div>
            <button class="vz-btn" style="width:auto;margin-top:14px;" onClick={load}>
              Spróbuj ponownie
            </button>
          </div>
        )}
        {business && <BookingFlow cfg={cfg} business={business} />}
      </div>
      <div class="vz-powered">
        Rezerwacje przez <b>Vizyto</b>
      </div>
    </div>
  )

  if (mode === 'inline') return <div class="vz-inline">{panel}</div>

  return (
    <>
      <button class="vz-launcher" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <div
          class="vz-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          {panel}
        </div>
      )}
    </>
  )
}

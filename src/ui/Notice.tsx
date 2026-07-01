import type { ComponentChildren } from 'preact'
import { Info } from './icons'

// Calm inline notice (e.g. the "rezerwacja próbna" test-mode banner). Warning-
// tinted, non-blocking; mirrors the info card in the Vizyto client app.
export function Notice({ title, children }: { title: string; children?: ComponentChildren }) {
  return (
    <div class="vz-notice" role="note">
      <span class="vz-notice-ico"><Info size={16} /></span>
      <div>
        <div class="vz-notice-title">{title}</div>
        {children && <div class="vz-notice-body">{children}</div>}
      </div>
    </div>
  )
}

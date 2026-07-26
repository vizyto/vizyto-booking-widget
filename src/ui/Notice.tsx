import type { ComponentChildren } from 'preact'
import { Info } from './icons'

// Calm inline notice (e.g. the "rezerwacja próbna" test-mode banner). The
// default is warning-tinted and non-blocking; 'plain' is the neutral variant for
// what the customer should read without being warned (the booking terms).
export function Notice({ title, tone = 'warn', children }: { title: string; tone?: 'warn' | 'plain'; children?: ComponentChildren }) {
  return (
    <div class={`vz-notice${tone === 'plain' ? ' plain' : ''}`} role="note">
      <span class="vz-notice-ico"><Info size={16} /></span>
      <div>
        <div class="vz-notice-title">{title}</div>
        {children && <div class="vz-notice-body">{children}</div>}
      </div>
    </div>
  )
}

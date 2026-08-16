import { useState } from 'preact/hooks'
import type { ComponentChildren, VNode } from 'preact'
import { Check } from './icons'

// Full-width choice card (service, specialist) matching the app: optional
// avatar/thumbnail, title + subtitle + description + meta, and a control on the
// right.
//
// Two shapes, exactly like WEB:
//  - without `control` - the WHOLE card is one radio/checkbox (specjalista,
//    zasób): tapping it picks the option.
//  - with `control` (lista usług) - the card splits into a clickable CONTENT
//    region (opens the service details) and the control next to it (plus /
//    ołówek + kosz). The control is a SIBLING of the region, never nested in it,
//    so a tap on the plus can't also open the details and no interactive element
//    lives inside another (jak OfferCard w WEB).
//
// Deliberately a <div role="..."> and not a <button>: a button inside a button
// is invalid HTML and swallows clicks. Keyboard support is therefore
// hand-rolled: Enter/Space on the region itself activates it.
export function SelectCard({
  avatar,
  thumb,
  title,
  sub,
  desc,
  meta,
  selected,
  onSelect,
  multi,
  control,
}: {
  // Circular avatar (workers / "Dowolny"). Mutually exclusive with `thumb`.
  avatar?: VNode | string
  // Rounded-square photo (services). When the key is present but the value is
  // null, a placeholder square keeps the list aligned. Undefined = no square.
  thumb?: string | null
  title: string
  sub?: string
  // Plain, clamped description (2 lines) shown under the title.
  desc?: string
  meta?: ComponentChildren
  selected: boolean
  /** Karta bez `control`: wybór opcji. Z `control`: klik w treść (szczegóły). */
  onSelect: () => void
  /** Multi-select semantics (cart): checkbox + square tick instead of a radio. */
  multi?: boolean
  /**
   * Własne sterowanie po prawej (plus / ołówek + kosz). Obecność tego slotu
   * przełącza kartę w układ dwustrefowy - bez niego zostaje kółko lub kwadracik.
   */
  control?: ComponentChildren
}) {
  // A broken/unreachable photo degrades to the same letter placeholder as null.
  const [imgOk, setImgOk] = useState(true)
  const activate = (e: KeyboardEvent) => {
    // Only the region itself - a key pressed inside is its own element's.
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect()
    }
  }
  const body = (
    <>
      {thumb !== undefined && (
        <span class="vz-card-thumb">
          {thumb && imgOk ? <img src={thumb} alt="" loading="lazy" onError={() => setImgOk(false)} /> : title.charAt(0)}
        </span>
      )}
      {avatar !== undefined && <span class="vz-card-av">{avatar}</span>}
      <span class="vz-card-main">
        <span class="vz-card-title">{title}</span>
        {sub && <span class="vz-card-sub">{sub}</span>}
        {desc && <span class="vz-card-desc">{desc}</span>}
        {meta && <span class="vz-card-meta">{meta}</span>}
      </span>
    </>
  )

  if (control !== undefined) {
    return (
      <div class={`vz-card split${selected ? ' selected' : ''}`}>
        <div class="vz-card-hit" role="button" tabIndex={0} onClick={onSelect} onKeyDown={activate}>
          {body}
        </div>
        {control}
      </div>
    )
  }

  return (
    <div
      class={`vz-card${selected ? ' selected' : ''}`}
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={activate}
    >
      {body}
      <span class={`vz-radio${multi ? ' square' : ''}${selected ? ' on' : ''}`}>{selected && <Check size={15} />}</span>
    </div>
  )
}

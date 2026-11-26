import { useState } from 'preact/hooks'
import type { ComponentChildren, VNode } from 'preact'
import { Check } from './icons'
import { CdnImg } from './CdnImg'

// Full-width choice tile (specialist, resource, offering, class, reward), the
// widget's copy of the app's BookingOptionTile ("Czysty miesiąc", vizyto #1168):
// a fill without a frame, the photo or an icon bubble, the name over one muted
// line, an optional trailing column (price over duration) and the radio mark. The
// picked tile carries the accent outline on an accent tint.
//
// The WHOLE tile is one radio/checkbox: tapping it picks the option. The service
// list is not built from it (a service row has its own controls, StepService).
//
// Deliberately a <div role="..."> and not a <button>: some tiles carry a band
// with its own content across the foot. Keyboard support is therefore
// hand-rolled: Enter/Space on the tile itself activates it.
export function SelectCard({
  avatar,
  thumb,
  title,
  sub,
  desc,
  meta,
  selected,
  disabled = false,
  onSelect,
  multi,
  trailing,
  foot,
  busy,
  describedBy,
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
  disabled?: boolean
  onSelect: () => void
  /** Multi-select semantics: checkbox + square tick instead of a radio. */
  multi?: boolean
  /** A right-aligned column before the mark: the price over the duration. */
  trailing?: ComponentChildren
  /**
   * A band across the card's foot, edge to edge (a worker's promotion). Only
   * the radio card takes it: the card then clips it and the body keeps its
   * padding in a row of its own above.
   */
  foot?: ComponentChildren
  /** The radio's price is still loading (`aria-busy`). */
  busy?: boolean
  /** Notes that describe the radio without lengthening its name (`aria-describedby`). */
  describedBy?: string
}) {
  // A broken/unreachable photo degrades to the same letter placeholder as null.
  const [imgOk, setImgOk] = useState(true)
  const select = () => { if (!disabled) onSelect() }
  const activate = (e: KeyboardEvent) => {
    // Only the region itself - a key pressed inside is its own element's.
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      select()
    }
  }
  const body = (
    <>
      {thumb !== undefined && (
        <span class="vz-card-thumb">
          {thumb && imgOk ? <CdnImg src={thumb} width={160} alt="" loading="lazy" onError={() => setImgOk(false)} /> : title.charAt(0)}
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

  const radio = (
    <>
      {trailing && <span class="vz-card-trail">{trailing}</span>}
      {/* The radio is a ring with a core (the app's BookingRadioMark); the checkbox keeps its tick. */}
      <span class={`vz-radio${multi ? ' square' : ''}${selected ? ' on' : ''}`} aria-hidden="true">{multi && selected && <Check size={15} />}</span>
    </>
  )
  return (
    <div
      class={`vz-card${foot ? ' has-foot' : ''}${selected ? ' selected' : ''}${disabled ? ' is-disabled' : ''}`}
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={selected}
      aria-busy={busy ? 'true' : undefined}
      aria-describedby={describedBy}
      tabIndex={disabled ? -1 : 0} aria-disabled={disabled || undefined}
      onClick={select}
      onKeyDown={activate}
    >
      {foot ? (
        <>
          <span class="vz-card-row">{body}{radio}</span>
          {foot}
        </>
      ) : (
        <>{body}{radio}</>
      )}
    </div>
  )
}

import { useState } from 'preact/hooks'
import type { ComponentChildren, VNode } from 'preact'
import { Check } from './icons'

// Full-width radio-style choice card (service, specialist) matching the app:
// optional avatar/thumbnail, title + subtitle + description + meta, and a
// check/empty radio on the right.
//
// Deliberately a <div role="radio|checkbox"> and not a <button>: the card can
// carry its own action (np. "Szczegóły usługi"), a button inside a button is
// invalid HTML and swallows clicks. Web's ServiceCard does the same. Keyboard
// support is therefore hand-rolled: Enter/Space on the card itself select it.
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
  action,
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
  onSelect: () => void
  /** Multi-select semantics (cart): checkbox + square tick instead of a radio. */
  multi?: boolean
  /** Secondary control rendered before the tick (e.g. details). Must stop propagation. */
  action?: ComponentChildren
  /**
   * Zastępuje domyślny znacznik (radio/checkbox) własnym sterowaniem - lista
   * usług używa tego na parę "dodaj / edytuj + usuń", tak jak kreator na
   * stronie. Bez tego zostaje kółko lub kwadracik.
   */
  control?: ComponentChildren
}) {
  // A broken/unreachable photo degrades to the same letter placeholder as null.
  const [imgOk, setImgOk] = useState(true)
  return (
    <div
      class={`vz-card${selected ? ' selected' : ''}`}
      /*
       * Z własnym sterowaniem (lista usług) karta NIE jest przełącznikiem:
       * dodaje albo otwiera edycję, a usuwa osobny kosz - więc rola "checkbox"
       * kłamałaby czytnikowi ekranu. Wtedy zachowuje się jak przycisk
       * z wciśnięciem, dokładnie jak ServiceCard w aplikacji webowej.
       */
      role={control ? 'button' : multi ? 'checkbox' : 'radio'}
      aria-checked={control ? undefined : selected}
      aria-pressed={control ? selected : undefined}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        // Only the card itself - a key pressed on the action button is its own.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
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
      {action}
      {control ?? (
        <span class={`vz-radio${multi ? ' square' : ''}${selected ? ' on' : ''}`}>{selected && <Check size={15} />}</span>
      )}
    </div>
  )
}

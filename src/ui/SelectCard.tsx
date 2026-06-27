import type { ComponentChildren, VNode } from 'preact'
import { Check } from './icons'

// Full-width radio-style choice card (service, specialist) matching the app:
// optional avatar, title + subtitle + meta, and a check/empty radio on the right.
export function SelectCard({
  avatar,
  title,
  sub,
  meta,
  selected,
  onSelect,
}: {
  avatar?: VNode | string
  title: string
  sub?: string
  meta?: ComponentChildren
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      class={`vz-card${selected ? ' selected' : ''}`}
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
    >
      {avatar !== undefined && <span class="vz-card-av">{avatar}</span>}
      <span class="vz-card-main">
        <span class="vz-card-title">{title}</span>
        {sub && <span class="vz-card-sub">{sub}</span>}
        {meta && <span class="vz-card-meta">{meta}</span>}
      </span>
      <span class={`vz-radio${selected ? ' on' : ''}`}>{selected && <Check size={15} />}</span>
    </button>
  )
}

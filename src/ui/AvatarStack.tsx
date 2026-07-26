import { Shuffle } from './icons'

/**
 * The people pinned across the cart, as overlapping avatars. Empty = nobody is
 * pinned, which is a state of its own ("Bez preferencji"), not a missing photo.
 */
export function AvatarStack({ people, max = 3 }: { people: { name: string; image: string | null }[]; max?: number }) {
  if (!people.length) {
    return (
      <span class="vz-avstack">
        <span class="vz-card-av"><Shuffle size={15} /></span>
      </span>
    )
  }
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return (
    <span class="vz-avstack">
      {shown.map((p) => (
        <span class="vz-card-av">{p.image ? <img src={p.image} alt="" /> : p.name.charAt(0)}</span>
      ))}
      {rest > 0 && <span class="vz-card-av">+{rest}</span>}
    </span>
  )
}

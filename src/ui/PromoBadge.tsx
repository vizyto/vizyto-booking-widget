import type { ComponentChildren } from 'preact'
import type { PromotionText } from '../api'
import { formatPrice2 } from '../api'
import { Tag } from './icons'

/**
 * The promotion badge ("-20%", "-15 zł", "Zaoszczędź do 20%"), in the plakietka
 * idiom: body text on an accent tint, 12px. The accent colours only the
 * background - a host may override it with anything, and accent text on its own
 * dilution can disappear.
 * - in flow by default;
 * - `corner`: the mark of a day or time tile (owner's mockup, #430) - pinned to
 *   the tile's top-right edge, straddling its border, opaque so the border line
 *   does not run through it. The tile keeps its label clear of the top ~10px and
 *   the row leaves that much room above (`.has-promo` on the strip or grid).
 */
export function PromoBadge({ children, corner = false }: { children: ComponentChildren; corner?: boolean }) {
  return <span class={`vz-promo-badge${corner ? ' corner' : ''}`}>{children}</span>
}

/**
 * "Najniższa cena z 30 dni przed obniżką: X". Every announced reduction of a
 * specific offer (badge, struck price, "Zaoszczędź do") has it on the same
 * screen, next to it. `label` names the position when a step lists several.
 */
export function LowestPriceLine({
  price,
  isFrom = false,
  suffix,
  label,
}: {
  price: number
  isFrom?: boolean
  suffix?: string | null
  label?: string | null
}) {
  return (
    <span class="vz-lowest-price">
      Najniższa cena z 30 dni przed obniżką{label ? ` (${label})` : ''}: {isFrom ? 'od ' : ''}{formatPrice2(price)}{suffix ? ` ${suffix}` : ''}
    </span>
  )
}

/** Sale-price idiom: the reference price struck and muted, then the price paid. */
export function PromoValue({
  price,
  priorPrice,
  advertised,
  suffix,
}: {
  price: number
  priorPrice?: number | null
  advertised: boolean
  suffix?: string | null
}) {
  const tail = suffix ? ` ${suffix}` : ''
  return (
    <span class="vz-promo-value">
      {advertised && priorPrice != null && <span class="vz-price-before">{formatPrice2(priorPrice)}{tail}</span>}
      <span>{formatPrice2(price)}{tail}</span>
    </span>
  )
}

/**
 * The badge every entry shares, or null when they differ or one has none - for
 * lists that name a shared value once (the class timetable's day header). Day
 * and time tiles no longer use it: each promoted tile carries its corner badge.
 * (Local copy of packages/shared commonBadge - the widget ships on its own.)
 */
export function commonBadge(badges: Array<string | null | undefined>): string | null {
  if (badges.length === 0) return null
  const first = badges[0]
  if (!first) return null
  return badges.every((badge) => badge === first) ? first : null
}

/** A value common to a whole set, or null when the set is empty or mixed. */
export function commonValue<T>(values: T[]): T | null {
  if (values.length === 0) return null
  const first = values[0]!
  return values.every((value) => value === first) ? first : null
}

/** One promoted cart position of a worker. `label` names it when the card covers several. */
export type StaffPromoEntry = { texts?: PromotionText[]; priorPrice?: number | null; label?: string | null }

/**
 * The entries a band can show. An announced reduction without its reference
 * price is not shown at all - callers pass `foot` only when this is non-empty.
 */
export function shownStaffPromos(entries: StaffPromoEntry[]) {
  return entries.filter((e): e is StaffPromoEntry & { texts: PromotionText[]; priorPrice: number } =>
    !!e.texts?.length && typeof e.priorPrice === 'number')
}

/**
 * A worker's own promotion in a specialist picker (owner's mockup, #430): a band
 * across the FOOT of the card, edge to edge - hairline on top, an accent tint a
 * step stronger than the selected card's wash, a tag icon, the amount in 500
 * weight, the when-part plain, the end date and the reference price under it.
 * Rendered through SelectCard's `foot`, which makes the card clip it. Every
 * promoted position of the card shares ONE band.
 */
export function StaffPromoBand({ entries }: { entries: StaffPromoEntry[] }) {
  const shown = shownStaffPromos(entries)
  if (!shown.length) return null
  return (
    <span class="vz-staff-band">
      <Tag size={16} class="vz-staff-band-icon" aria-hidden="true" />
      <span class="vz-staff-band-body">
        {shown.map((entry, i) => (
          <span class="vz-staff-band-entry" key={`${entry.label ?? ''}-${i}`}>
            {entry.texts.map((text, index) => (
              <span class="vz-staff-band-text" key={`${text.amount}-${text.rest}-${index}`}>
                <span class="vz-staff-band-line">
                  {entry.label && <>{entry.label}: </>}
                  <b>{text.amount}</b>{text.rest ? ` ${text.rest}` : ''}
                </span>
                {text.note && <span class="vz-staff-band-note">{text.note}</span>}
              </span>
            ))}
            <span class="vz-staff-band-note">
              Najniższa cena z 30 dni przed obniżką{entry.label ? ` (${entry.label})` : ''}: {formatPrice2(entry.priorPrice)}
            </span>
          </span>
        ))}
      </span>
    </span>
  )
}

/** One reference-price line of a step: its price, and the position when several. */
export type PromoNote = { price: number; isFrom?: boolean; suffix?: string | null; label?: string | null }

export function PromoNotes({ notes }: { notes: PromoNote[] }) {
  return (
    <>
      {notes.map((n, index) => (
        <LowestPriceLine key={`${n.label ?? ''}-${index}`} price={n.price} isFrom={n.isFrom} suffix={n.suffix} label={n.label} />
      ))}
    </>
  )
}

/**
 * Day badges of a strip or month: every bookable day with a promotion carries
 * its own mark (a corner badge on a week tile, a dot in the month grid); a
 * disabled day never does. `any` says whether the set shows any mark at all.
 */
export function dayPromo(days: string[], bookable: (d: string) => boolean, badges: Record<string, string | null> | null | undefined) {
  const tile = (d: string): string | null => (bookable(d) ? badges?.[d] ?? null : null)
  return { any: days.some((d) => !!tile(d)), tile }
}

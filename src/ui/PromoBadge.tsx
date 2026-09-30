import type { ComponentChildren } from 'preact'
import type { PromotionText } from '../api'
import { formatPrice2 } from '../api'

/**
 * The promotion badge ("-20%", "-15 zł", "Zaoszczędź do 20%"), in the plakietka
 * idiom: body text on an accent tint, 12px, always in flow. The accent colours
 * only the background - a host may override it with anything, and accent text
 * on its own dilution can disappear.
 */
export function PromoBadge({ children }: { children: ComponentChildren }) {
  return <span class="vz-promo-badge">{children}</span>
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
 * The badge every entry shares, or null when they differ or one has none. A
 * promotion is shown where it discriminates: a value every slot of a section (or
 * every bookable day of a strip) shares goes once in the section header and the
 * tiles stay clean; only a mixed set is marked tile by tile.
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

/**
 * A worker's own promotion in a specialist picker: the amount as a badge, the
 * when-part and the end date as helper lines, then the reference price. No tinted
 * panel - the selected card already carries the accent wash. `label` names the
 * cart position when the card covers several.
 */
export function StaffPromotion({
  texts = [],
  priorPrice,
  label,
}: {
  texts?: PromotionText[]
  priorPrice?: number | null
  label?: string | null
}) {
  if (!texts.length || typeof priorPrice !== 'number') return null
  return (
    <span class="vz-staff-promo">
      {texts.map((text, index) => (
        <span class="vz-staff-promo-text" key={`${text.amount}-${text.rest}-${index}`}>
          <span class="vz-staff-promo-line">
            {label && <span class="vz-staff-promo-name">{label}:</span>}
            <PromoBadge>{text.amount}</PromoBadge>
            {text.rest && <span class="vz-opt-desc">{text.rest}</span>}
          </span>
          {text.note && <span class="vz-opt-desc">{text.note}</span>}
        </span>
      ))}
      <LowestPriceLine price={priorPrice} label={label} />
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
 * Day badges of a strip or month, reduced to where they discriminate: a value
 * every bookable day shares is `common` (shown once, under the calendar) and the
 * tiles stay clean; otherwise `tile(d)` gives each bookable day its own. A
 * disabled day never carries one.
 */
export function dayPromo(days: string[], bookable: (d: string) => boolean, badges: Record<string, string | null> | null | undefined) {
  const open = days.filter(bookable)
  const values = open.map((d) => badges?.[d] ?? null)
  const common = commonBadge(values)
  return {
    common,
    any: values.some(Boolean),
    tile: (d: string): string | null => (common || !bookable(d) ? null : badges?.[d] ?? null),
  }
}

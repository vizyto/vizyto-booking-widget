import type { ComponentChildren } from 'preact'
import type { PromoPriceFields, PromotionText } from '../api'
import { formatPrice2 } from '../api'

export function PromoBadge({ children, floating = false }: { children: ComponentChildren; floating?: boolean }) {
  return <span class={`vz-promo-badge${floating ? ' floating' : ''}`}>{children}</span>
}

export function LowestPriceLine({ price, isFrom = false, suffix }: { price: number; isFrom?: boolean; suffix?: string | null }) {
  return (
    <span class="vz-lowest-price">
      Najniższa cena z 30 dni przed obniżką: {isFrom ? 'od ' : ''}{formatPrice2(price)}{suffix ? ` ${suffix}` : ''}
    </span>
  )
}

export function PromotionalPrice({ promo, suffix }: { promo: PromoPriceFields; suffix?: string }) {
  return (
    <span class="vz-promo-price-wrap">
      <span class="vz-promo-price">
        {promo.advertised && promo.priorPrice != null && <span class="vz-price-before">{formatPrice2(promo.priorPrice)}</span>}
        <span>{formatPrice2(promo.price)}{suffix ? ` ${suffix}` : ''}</span>
        {promo.advertised && promo.badge && <PromoBadge>{promo.badge}</PromoBadge>}
      </span>
      {promo.advertised && promo.priorPrice != null && <LowestPriceLine price={promo.priorPrice} />}
    </span>
  )
}

export function StaffPromotion({ texts = [], priorPrice }: { texts?: PromotionText[]; priorPrice?: number | null }) {
  if (!texts.length || typeof priorPrice !== 'number') return null
  return (
    <span class="vz-staff-promo">
      {texts.map((text, index) => (
        <span class="vz-staff-promo-text" key={`${text.amount}-${text.rest}-${index}`}>
          <span><b>{text.amount}</b>{text.rest ? ` ${text.rest}` : ''}</span>
          {text.note && <small>{text.note}</small>}
        </span>
      ))}
      <LowestPriceLine price={priorPrice} />
    </span>
  )
}

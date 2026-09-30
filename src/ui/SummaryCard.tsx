import type { PriceQuote } from '../api'
import { LowestPriceLine, PromoBadge, PromoValue } from './PromoBadge'

export type SummaryRow = {
  label: string
  value: string
  total?: boolean
  priorValue?: string | null
  badge?: string | null
  lowestPrice?: number | null
}

const ON_SITE = 'Cena na miejscu'

/**
 * Recap card. The rows keep their own price anatomy ("Cena" / "Kwota"); an
 * advertised quote replaces that price row with its own block - one position as
 * a single "Cena" row, several as a breakdown with "Razem" - and carries the one
 * reference-price line of the reduction. A quote without a promotion is never
 * rendered here: the caller puts its total in the ordinary price row.
 */
export function SummaryCard({ rows, quote }: { rows: SummaryRow[]; quote?: PriceQuote | null }) {
  const promo = quote?.advertised ? quote : null
  const many = (promo?.lines.length ?? 0) >= 2
  return (
    <div class="vz-summary">
      {rows.map((r) => (
        <div class={`vz-row${r.total ? ' total' : ''}${r.lowestPrice != null ? ' has-note' : ''}`}>
          <span>{r.label}</span>
          {r.priorValue || r.badge ? (
            <span class="vz-row-promo">
              <span class="vz-promo-value">
                {r.priorValue && <span class="vz-price-before">{r.priorValue}</span>}
                <span>{r.value}</span>
              </span>
              {r.badge && <PromoBadge>{r.badge}</PromoBadge>}
            </span>
          ) : (
            <span>{r.value}</span>
          )}
          {/* A div, not a span: the row's span rules would size it as the price. */}
          {r.lowestPrice != null && <div class="vz-row-note"><LowestPriceLine price={r.lowestPrice} /></div>}
        </div>
      ))}
      {promo && (
        <div class={`vz-quote${rows.length ? '' : ' first'}`}>
          {many ? (
            <>
              <div class="vz-quote-head">
                <span>Cena</span>
                {promo.badge && <PromoBadge>{promo.badge}</PromoBadge>}
              </div>
              {promo.lines.map((line, index) => (
                <div class="vz-row" key={`${line.kind}-${line.name}-${index}`}>
                  <span>{line.name}{line.quantity > 1 ? ` x ${line.quantity}` : ''}</span>
                  <span>
                    {line.price != null
                      ? <PromoValue price={line.price} priorPrice={line.priorPrice} advertised={line.advertised} />
                      : ON_SITE}
                  </span>
                </div>
              ))}
              <div class="vz-row total">
                <span>Razem</span>
                <span>
                  {promo.total != null
                    ? <PromoValue price={promo.total} priorPrice={promo.priorTotal} advertised={promo.advertised} />
                    : ON_SITE}
                </span>
              </div>
            </>
          ) : promo.lines.length === 0 ? (
            <div class="vz-row total">
              <span>Cena</span>
              <span class="vz-row-promo">
                <span>
                  {promo.total != null
                    ? <PromoValue price={promo.total} priorPrice={promo.priorTotal} advertised={promo.advertised} />
                    : ON_SITE}
                </span>
                {promo.badge && <PromoBadge>{promo.badge}</PromoBadge>}
              </span>
            </div>
          ) : (
            promo.lines.map((line, index) => (
              <div class="vz-row total" key={`${line.kind}-${line.name}-${index}`}>
                <span>Cena</span>
                <span class="vz-row-promo">
                  <span>
                    {line.price != null
                      ? <PromoValue price={line.price} priorPrice={line.priorPrice} advertised={line.advertised} />
                      : ON_SITE}
                  </span>
                  {(line.badge ?? promo.badge) && <PromoBadge>{line.badge ?? promo.badge}</PromoBadge>}
                </span>
              </div>
            ))
          )}
          {promo.priorTotal != null && (
            <div class="vz-quote-note">
              <LowestPriceLine price={promo.priorTotal} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

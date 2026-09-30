import type { PriceQuote } from '../api'
import { formatPrice2 } from '../api'
import { LowestPriceLine, PromoBadge } from './PromoBadge'

export type SummaryRow = {
  label: string
  value: string
  total?: boolean
  priorValue?: string | null
  badge?: string | null
  lowestPrice?: number | null
}

export function SummaryCard({ rows, quote }: { rows: SummaryRow[]; quote?: PriceQuote | null }) {
  return (
    <div class="vz-summary">
      {rows.map((r) => (
        <div class={`vz-row${r.total ? ' total' : ''}`}>
          <span>{r.label}</span>
          <span>
            <span class="vz-quote-value">
              {r.priorValue && <span class="vz-price-before">{r.priorValue}</span>}
              <span>{r.value}</span>
              {r.badge && <PromoBadge>{r.badge}</PromoBadge>}
            </span>
            {r.lowestPrice != null && <LowestPriceLine price={r.lowestPrice} />}
          </span>
        </div>
      ))}
      {quote && quote.total != null && (
        <div class={`vz-quote${rows.length ? '' : ' first'}`}>
          <div class="vz-quote-head">
            {quote.advertised ? 'Cena w promocji' : quote.lines.length >= 2 ? 'Płatność' : 'Cena'}
            {quote.advertised && quote.badge && <PromoBadge>{quote.badge}</PromoBadge>}
          </div>
          {quote.lines.map((line, index) => (
            <div class="vz-quote-line" key={`${line.kind}-${line.name}-${index}`}>
              <span>{line.name}{line.quantity > 1 ? ` x ${line.quantity}` : ''}</span>
              <span class="vz-quote-value">
                {line.advertised && line.priorPrice != null && <span class="vz-price-before">{formatPrice2(line.priorPrice)}</span>}
                <span>{line.price != null ? formatPrice2(line.price) : 'Cena na miejscu'}</span>
              </span>
            </div>
          ))}
          {quote.lines.length >= 2 && (
            <div class="vz-quote-total">
              <span>Razem</span>
              <span>{formatPrice2(quote.total)}</span>
            </div>
          )}
          {quote.advertised && quote.priorTotal != null && <LowestPriceLine price={quote.priorTotal} />}
        </div>
      )}
    </div>
  )
}

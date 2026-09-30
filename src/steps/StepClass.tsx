import type { GroupClass, PublicPromotionSummary, Service } from '../api'
import { priceLabel, formatDuration, richTextToPlain } from '../api'
import { AvailabilityBadge } from '../ui/AvailabilityBadge'
import { SelectCard } from '../ui/SelectCard'
import { Clock } from '../ui/icons'
import { LowestPriceLine, PromoBadge } from '../ui/PromoBadge'

export type ClassOption = { cls: GroupClass; service: Service }

/**
 * Pick a class. Single select, no cart: one attendee row per person per term is
 * enforced by a partial unique index server-side, so there is nothing to
 * accumulate and pretending otherwise would invent a basket the backend refuses.
 *
 * No variants and no add-ons either - both are wired to bookingType 'individual'
 * in the database, so a class genuinely has neither. That is why this step is a
 * plain radio list and not a second StepService.
 */
export function StepClass({
  options,
  selectedId,
  onPick,
  promotionSummary,
}: {
  options: ClassOption[]
  selectedId: number | null
  onPick: (o: ClassOption) => void
  promotionSummary?: PublicPromotionSummary | null
}) {
  if (options.length === 0) {
    return (
      <div style="margin-top:20px;text-align:center;">
        <div class="vz-muted">Ten grafik jest chwilowo pusty.</div>
      </div>
    )
  }
  return (
    <div class="vz-list vz-stagger" role="radiogroup" aria-label="Wybierz zajęcia">
      {options.map(({ cls, service }) => {
        const promotion = promotionSummary?.groupClasses.find((p) => p.groupClassId === cls.id)
        return <SelectCard
          key={cls.id}
          thumb={service.image ?? null}
          title={service.name}
          desc={richTextToPlain(service.description)}
          selected={cls.availability !== 'full' && selectedId === cls.id}
          disabled={cls.availability === 'full'}
          onSelect={() => onPick({ cls, service })}
          meta={
            <>
              <span class="vz-dur"><Clock size={14} /> {formatDuration(service.duration)}</span>
              <AvailabilityBadge availability={cls.availability} />
              <span class="vz-price">{priceLabel(service.price)}</span>
              {promotion && <PromoBadge>Zaoszczędź do {promotion.saveUpToPercent}%</PromoBadge>}
              {promotion && <LowestPriceLine price={promotion.priorPrice} />}
            </>
          }
        />
      })}
    </div>
  )
}

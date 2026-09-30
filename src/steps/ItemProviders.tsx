import { useState } from 'preact/hooks'
import type { PublicPromotionSummary, Resource, Service } from '../api'
import { configuredTotals, formatDuration, formatPrice2 } from '../api'
import { getResourcesForService, getStaffItems } from '../providerMode'
import { SelectCard } from '../ui/SelectCard'
import { ChevronDown, Shuffle } from '../ui/icons'
import { StaffPromoBand, shownStaffPromos } from '../ui/PromoBadge'

export type AssignItem = {
  service: Service
  variantDuration: number | null
  addonIds: number[]
  resourceId?: number | null
}

/**
 * Who performs which service, one row per cart position. Each row carries its
 * own answer as a chip; tapping it opens the list scoped to THAT service, so a
 * named specialist and "bez preferencji" can be mixed in one visit.
 *
 * Rendered both on the specialist step and under the summary chip on the time
 * step - the assignments have to be editable wherever they are shown.
 */
export function ItemProviders({
  items,
  workers,
  onPick,
  promotionSummary,
}: {
  items: AssignItem[]
  /** Every bookable worker - the per-service candidates are filtered from these. */
  workers: Resource[]
  onPick: (serviceId: number, resourceId: number | null) => void
  promotionSummary?: PublicPromotionSummary | null
}) {
  const [openId, setOpenId] = useState<number | null>(null)
  const staffItems = getStaffItems(items)
  if (!staffItems.length) return null

  return (
    <div class="vz-assign vz-stagger">
      {staffItems.map((it) => {
        const candidates = getResourcesForService(workers, it.service)
        const picked =
          typeof it.resourceId === 'number' ? workers.find((w) => w.id === it.resourceId) : undefined
        const open = openId === it.service.id
        const totals = configuredTotals(it.service, it.variantDuration, it.addonIds, picked?.id)
        return (
          <div class="vz-assign-row">
            <div class="vz-assign-head">
              <span class="vz-assign-name">{it.service.name}</span>
              <span class="vz-assign-dur">{formatDuration(totals.duration)}</span>
            </div>
            <button
              type="button"
              class={`vz-chip${open ? ' on' : ''}`}
              disabled={candidates.length === 0}
              aria-expanded={candidates.length ? (open ? 'true' : 'false') : undefined}
              onClick={() => candidates.length && setOpenId(open ? null : it.service.id)}
            >
              <span class="vz-chip-av">
                {picked ? picked.image ? <img src={picked.image} alt="" /> : picked.name.charAt(0) : <Shuffle size={13} />}
              </span>
              <span class="vz-chip-name">{picked?.name ?? 'Bez preferencji'}</span>
              {candidates.length > 0 && <ChevronDown size={15} class="vz-chip-cv" />}
            </button>
            {open && (
              <div class="vz-list vz-assign-opts vz-stagger" role="radiogroup" aria-label={`Kto wykona: ${it.service.name}`}>
                <SelectCard
                  avatar={<Shuffle size={20} />}
                  title="Bez preferencji"
                  sub="Maksymalna dostępność"
                  selected={it.resourceId == null}
                  onSelect={() => {
                    onPick(it.service.id, null)
                    setOpenId(null)
                  }}
                />
                {candidates.map((c) => {
                  const promotion = promotionSummary?.staff.find((x) => x.resourceId === c.id && x.businessServiceId === it.service.id)
                  const staffPromos = promotion ? shownStaffPromos([{ texts: promotion.texts, priorPrice: promotion.priorPrice }]) : []
                  return (
                    <SelectCard
                      key={c.id}
                      avatar={c.image ? <img src={c.image} alt="" /> : c.name.charAt(0)}
                      title={c.name}
                      sub={c.position || undefined}
                      meta={
                        <span class="vz-price">
                          {formatPrice2(configuredTotals(it.service, it.variantDuration, it.addonIds, c.id).price)}
                        </span>
                      }
                      foot={staffPromos.length ? <StaffPromoBand entries={staffPromos} /> : undefined}
                      selected={it.resourceId === c.id}
                      onSelect={() => {
                        onPick(it.service.id, c.id)
                        setOpenId(null)
                      }}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

import type { Service } from '../api'
import { addonsValid, configuredTotals, formatDuration, formatPrice2, resolveVariant } from '../api'
import { Check } from '../ui/icons'

// Configure sub-step: pick a length variant and add-ons for the chosen service.
// Mirrors the web wizard's ServiceAddons surface. Owns its own "Gotowe" button
// (disabled until every group meets its minimum); the sticky CTA is hidden while
// this is open. Changes are controlled by the parent, applied live.
export function StepConfigure({
  service,
  variantDuration,
  addonIds,
  workerId,
  onPickVariant,
  onToggleAddon,
  onDone,
}: {
  service: Service
  variantDuration: number | null
  addonIds: number[]
  // Pinned worker (per-employee price/duration), when one is already chosen.
  workerId?: number
  onPickVariant: (durationMinutes: number) => void
  onToggleAddon: (id: number) => void
  onDone: () => void
}) {
  const variants = service.durationOptions ?? []
  const hasVariants = variants.length >= 2
  const groups = service.addonGroups ?? []
  const chosen = new Set(addonIds)
  const activeVariant = resolveVariant(service, variantDuration)
  const totals = configuredTotals(service, variantDuration, addonIds, workerId)
  const valid = addonsValid(service, addonIds)

  const groupHint = (min: number, max: number | null) => {
    if (min > 0 && max != null) return min === max ? `Wybierz ${min}` : `Wybierz ${min}-${max}`
    if (min > 0) return `Wybierz min. ${min}`
    if (max != null) return `Wybierz maks. ${max}`
    return 'Opcjonalnie'
  }

  return (
    <div class="vz-fade-in">
      {hasVariants && (
        <div class="vz-cfg-section">
          <div class="vz-cfg-h"><span>Wariant</span></div>
          <div class="vz-stagger">
            {variants.map((o) => {
              const on = activeVariant?.durationMinutes === o.durationMinutes
              return (
                <button type="button" class={`vz-opt${on ? ' on' : ''}`} role="radio" aria-checked={on} onClick={() => onPickVariant(o.durationMinutes)}>
                  <span class="vz-opt-main">
                    <span class="vz-opt-name">{o.label || formatDuration(o.durationMinutes)}</span>
                    <span class="vz-opt-desc">{formatDuration(o.durationMinutes)}</span>
                  </span>
                  <span class="vz-opt-price">{formatPrice2(o.priceCents ?? service.price)}</span>
                  <span class={`vz-opt-tick round${on ? ' on' : ''}`}>{on && <Check size={14} />}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {groups.map((g) => {
        const countInGroup = g.addons.filter((a) => chosen.has(a.id)).length
        const atMax = g.maxSelect != null && countInGroup >= g.maxSelect
        return (
          <div class="vz-cfg-section">
            <div class="vz-cfg-h">
              <span>{g.name}</span>
              <span class="vz-cfg-hint">{groupHint(g.minSelect, g.maxSelect)}</span>
            </div>
            <div class="vz-stagger">
              {g.addons.map((a) => {
                const on = chosen.has(a.id)
                const locked = !on && atMax
                return (
                  <button
                    type="button"
                    class={`vz-opt${on ? ' on' : ''}`}
                    role="checkbox"
                    aria-checked={on}
                    disabled={locked}
                    onClick={() => onToggleAddon(a.id)}
                  >
                    <span class="vz-opt-main">
                      <span class="vz-opt-name">{a.name}</span>
                      {a.description && <span class="vz-opt-desc">{a.description}</span>}
                      {a.extraDurationMinutes > 0 && <span class="vz-opt-desc">+{formatDuration(a.extraDurationMinutes)}</span>}
                    </span>
                    <span class="vz-opt-price">{a.price > 0 ? `+${formatPrice2(a.price)}` : 'gratis'}</span>
                    <span class={`vz-opt-tick square${on ? ' on' : ''}`}>{on && <Check size={14} />}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      <div class="vz-cfg-total">
        <span>Razem</span>
        <span>{formatPrice2(totals.price)} · {formatDuration(totals.duration)}</span>
      </div>
      <button class="vz-btn" onClick={onDone} disabled={!valid} type="button">Gotowe</button>
    </div>
  )
}

import { useState } from 'preact/hooks'
import type { Service } from '../api'
import { formatDuration, formatPrice2, richTextToPlain, serviceBaseRange } from '../api'
import type { Resource } from '../api'
import { Check, Clock } from '../ui/icons'

/**
 * Szczegóły usługi - odpowiednik arkusza "service/Details" z profilu w Vizyto:
 * galeria zdjęć, pełny opis (nieprzycięty), cena i czas w stopce oraz przycisk
 * wyboru. Do tej pory widget pobierał galerię usługi z API i ją wyrzucał, a opis
 * przycinał do dwóch linii bez możliwości rozwinięcia.
 *
 * Nakłada się na listę usług (jak StepConfigure), więc niesie własne CTA, a
 * przycisk "wstecz" w nagłówku panelu zamyka podgląd.
 */
export function StepDetails({
  service,
  workers,
  selected,
  onToggle,
}: {
  service: Service
  workers: Resource[]
  /** Czy usługa jest już w koszyku - CTA mówi wtedy o usunięciu. */
  selected: boolean
  onToggle: () => void
}) {
  const images = (service.images ?? []).map((i) => i.url).filter(Boolean)
  const [active, setActive] = useState(0)
  const [broken, setBroken] = useState<Record<number, boolean>>({})
  const desc = richTextToPlain(service.description)
  const { min, from } = serviceBaseRange(service, workers)
  const shown = images.filter((_, i) => !broken[i])

  return (
    <div class="vz-fade-in vz-det">
      {shown.length > 0 && (
        <div class="vz-det-gallery">
          <div class="vz-det-photo">
            <img
              src={images[active] ?? shown[0]}
              alt={service.name}
              onError={() => setBroken((b) => ({ ...b, [active]: true }))}
            />
          </div>
          {images.length > 1 && (
            <div class="vz-det-thumbs" role="tablist" aria-label="Zdjęcia usługi">
              {images.map((url, i) =>
                broken[i] ? null : (
                  <button
                    type="button"
                    key={url}
                    class={`vz-det-thumb${i === active ? ' on' : ''}`}
                    role="tab"
                    aria-selected={i === active}
                    aria-label={`Zdjęcie ${i + 1} z ${images.length}`}
                    onClick={() => setActive(i)}
                  >
                    <img src={url} alt="" loading="lazy" onError={() => setBroken((b) => ({ ...b, [i]: true }))} />
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      )}

      <h3 class="vz-det-title">{service.name}</h3>
      <div class="vz-det-meta">
        <span class="vz-dur"><Clock size={14} /> {formatDuration(service.duration)}</span>
        <span class="vz-price">{from ? 'od ' : ''}{formatPrice2(min)}</span>
      </div>

      {desc ? (
        <p class="vz-det-desc">{desc}</p>
      ) : (
        <p class="vz-det-desc vz-muted">Salon nie dodał jeszcze opisu tej usługi.</p>
      )}

      <button type="button" class={`vz-btn${selected ? ' ghost' : ''} vz-det-cta`} onClick={onToggle}>
        {selected ? 'Usuń z wizyty' : <>Wybierz <Check size={16} /></>}
      </button>
    </div>
  )
}

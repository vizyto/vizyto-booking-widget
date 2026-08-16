import { useEffect, useState } from 'preact/hooks'
import type { Service } from '../api'
import { formatDuration, formatPrice2, richTextToPlain, serviceBaseRange } from '../api'
import type { Resource } from '../api'
import { ChevronLeft, ChevronRight, Clock, Close } from '../ui/icons'

/**
 * Szczegóły usługi - ten sam ekran co arkusz "service/Details" na profilu
 * w Vizyto i w kreatorze na stronie: pasek kwadratowych zdjęć (dotknięcie
 * powiększa), pełny opis bez przycinania oraz stopka z ceną, czasem i akcją.
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
  // Zdjęcie, którego nie da się pobrać, znika z paska zamiast zostawiać dziurę.
  const [broken, setBroken] = useState<Record<string, boolean>>({})
  const shots = images.filter((url) => !broken[url])
  // Powiększenie trzymamy po URL-u, nie po indeksie: pasek może się skrócić
  // o zepsute zdjęcie i indeks wskazywałby wtedy na inną klatkę.
  const [zoom, setZoom] = useState<string | null>(null)
  const at = zoom ? shots.indexOf(zoom) : -1
  const desc = richTextToPlain(service.description)
  const { min, from } = serviceBaseRange(service, workers)

  const step = (d: number) => {
    if (at < 0 || shots.length < 2) return
    setZoom(shots[(at + d + shots.length) % shots.length]!)
  }

  // Escape zamyka powiększenie, strzałki przewijają - klawiatura ma dojść tam,
  // gdzie dochodzi palec. Nasłuch w fazie PRZECHWYTYWANIA i z zatrzymaniem
  // propagacji, bo Escape zamyka też cały widget: bez tego jedno naciśnięcie
  // zwijało zdjęcie razem z rezerwacją.
  useEffect(() => {
    if (at < 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') setZoom(null)
      else step(e.key === 'ArrowRight' ? 1 : -1)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [at, shots.length])

  return (
    <div class="vz-fade-in vz-det">
      <h3 class="vz-det-title">{service.name}</h3>

      {shots.length > 0 && (
        <div class="vz-det-gal">
          {shots.map((url, i) => (
            <button
              type="button"
              key={url}
              class="vz-det-shot"
              aria-label={`Powiększ zdjęcie ${i + 1} z ${shots.length}`}
              onClick={() => setZoom(url)}
            >
              <img src={url} alt="" loading="lazy" onError={() => setBroken((b) => ({ ...b, [url]: true }))} />
            </button>
          ))}
        </div>
      )}

      {desc ? (
        <p class="vz-det-desc">{desc}</p>
      ) : (
        <p class="vz-det-desc vz-muted">Salon nie dodał jeszcze opisu tej usługi.</p>
      )}

      {/* Stopka jak w arkuszu na stronie: cena i czas po lewej, akcja po prawej. */}
      <div class="vz-det-foot">
        <div class="vz-det-foot-t">
          <span class="vz-det-price">{from ? 'od ' : ''}{formatPrice2(min)}</span>
          <span class="vz-det-dur"><Clock size={13} /> {formatDuration(service.duration)}</span>
        </div>
        <button type="button" class={`vz-btn${selected ? ' ghost' : ''} vz-det-cta`} onClick={onToggle}>
          {selected ? 'Usuń z wizyty' : 'Dodaj do wizyty'}
        </button>
      </div>

      {at >= 0 && (
        <div
          class="vz-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Zdjęcie ${at + 1} z ${shots.length}: ${service.name}`}
          onClick={() => setZoom(null)}
        >
          <img class="vz-lb-img" src={shots[at]} alt={service.name} onClick={(e) => e.stopPropagation()} />
          <button type="button" class="vz-lb-btn close" aria-label="Zamknij zdjęcie" onClick={() => setZoom(null)}>
            <Close size={20} />
          </button>
          {shots.length > 1 && (
            <>
              <button
                type="button"
                class="vz-lb-btn prev"
                aria-label="Poprzednie zdjęcie"
                onClick={(e) => { e.stopPropagation(); step(-1) }}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                class="vz-lb-btn next"
                aria-label="Następne zdjęcie"
                onClick={(e) => { e.stopPropagation(); step(1) }}
              >
                <ChevronRight size={20} />
              </button>
              <span class="vz-lb-count">{at + 1} / {shots.length}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

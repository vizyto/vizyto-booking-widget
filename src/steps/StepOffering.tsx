import { SelectCard } from '../ui/SelectCard'
import { Calendar, KeyRound, Users, Utensils } from '../ui/icons'

export type OfferingKind = 'service' | 'class' | 'rental' | 'table'

/**
 * "Co chcesz zarezerwować?" - shown ONLY when the business sells both individual
 * visits and group classes, and only when the host page did not already say which
 * (a timetable CTA passes `classId`, so the club's own customers never see this).
 *
 * Why a fork and not one mixed list: the two ask a different question about time.
 * A visit is "pick an hour that suits you"; a class is "join something that
 * already has an hour". On one list a class card is visually indistinguishable
 * from a service, so the customer only discovers the difference after tapping.
 * Splitting at the top costs one tap in a mixed business and keeps both mental
 * models honest.
 */
export function StepOffering({
  selected,
  onPick,
  kinds,
  serviceLabel,
  classLabel,
  rentalLabel,
  tableLabel,
}: {
  selected: OfferingKind | null
  onPick: (k: OfferingKind) => void
  /** Only the families this business actually sells - never a dead option. */
  kinds: OfferingKind[]
  serviceLabel: string
  classLabel: string
  rentalLabel: string
  tableLabel: string
}) {
  return (
    <div class="vz-list vz-stagger" role="radiogroup" aria-label="Co chcesz zarezerwować">
      {kinds.includes('service') && (
        <SelectCard
          avatar={<Calendar size={20} />}
          title={serviceLabel}
          desc="Wybierasz termin, który Ci pasuje."
          selected={selected === 'service'}
          onSelect={() => onPick('service')}
        />
      )}
      {kinds.includes('class') && (
        <SelectCard
          avatar={<Users size={20} />}
          title={classLabel}
          desc="Zapisujesz się na termin z grafiku."
          selected={selected === 'class'}
          onSelect={() => onPick('class')}
        />
      )}
      {kinds.includes('rental') && (
        <SelectCard
          avatar={<KeyRound size={20} />}
          title={rentalLabel}
          desc="Wybierasz, na jak długo i od kiedy."
          selected={selected === 'rental'}
          onSelect={() => onPick('rental')}
        />
      )}
      {/* Restaurant tables (#903): the venue picks the table, the guest the hour. */}
      {kinds.includes('table') && (
        <SelectCard
          avatar={<Utensils size={20} />}
          title={tableLabel}
          desc="Wybierasz godzinę, lokal dobierze stolik."
          selected={selected === 'table'}
          onSelect={() => onPick('table')}
        />
      )}
    </div>
  )
}

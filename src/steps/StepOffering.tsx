import { SelectCard } from '../ui/SelectCard'
import { Calendar, Users } from '../ui/icons'

export type OfferingKind = 'service' | 'class'

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
  serviceLabel,
  classLabel,
}: {
  selected: OfferingKind | null
  onPick: (k: OfferingKind) => void
  serviceLabel: string
  classLabel: string
}) {
  return (
    <div class="vz-list vz-stagger" role="radiogroup" aria-label="Co chcesz zarezerwować">
      <SelectCard
        avatar={<Calendar size={20} />}
        title={serviceLabel}
        desc="Wybierasz termin, który Ci pasuje."
        selected={selected === 'service'}
        onSelect={() => onPick('service')}
      />
      <SelectCard
        avatar={<Users size={20} />}
        title={classLabel}
        desc="Zapisujesz się na termin z grafiku."
        selected={selected === 'class'}
        onSelect={() => onPick('class')}
      />
    </div>
  )
}

import { useMemo, useState } from 'preact/hooks'
import type { VNode } from 'preact'
import type { DayCounts, PromoBadges, Slots } from '../api'
import { slotLabel } from '../api'
import { ChevronDown, Bell } from '../ui/icons'
import { AvatarStack } from '../ui/AvatarStack'
import { DAY_PARTS, dayPartIndex } from '../calendar'
import { DayHeading, MonthCalendar } from '../ui/MonthCalendar'
import { Spinner } from '../ui/Spinner'
import { PromoBadge, dayPromo } from '../ui/PromoBadge'

export function StepDateTime({
  days,
  counts,
  date,
  slots,
  loading,
  timezone,
  selectedSlot,
  onPickDate,
  onPickSlot,
  canWaitlist = false,
  onJoinWaitlist,
  onFindNext,
  findingNext = false,
  noneAhead = false,
  chain,
  slotPicker,
  providerChip,
  emptyReason,
  onCheckAll,
  promoBadges,
}: {
  days: string[]
  counts: DayCounts
  date: string
  slots: Slots
  loading: boolean
  timezone: string | null
  selectedSlot: string
  onPickDate: (d: string) => void
  onPickSlot: (k: string) => void
  // When a selected day has no free slots, offer to join the waitlist.
  canWaitlist?: boolean
  onJoinWaitlist?: () => void
  /** Jump to the first day that has a free chain start (server sweeps 60 days). */
  onFindNext?: () => void
  findingNext?: boolean
  /** Set once a search came back empty, so we stop offering it. */
  noneAhead?: boolean
  /** Chain plan for the picked slot - only meaningful for a multi-position cart. */
  chain?: { rows: { time: string; name: string; duration: string }[]; total: string } | null
  /** Who is free at the picked slot, when refining "Dowolny" makes sense. */
  slotPicker?: {
    candidates: { id: number; name: string; price: string }[]
    selectedId: number | null
    onPick: (id: number | null) => void
  } | null
  /**
   * Who the hours belong to, above the calendar. `editor` is the per-position
   * assignment list - present when the choice can still be changed from here.
   */
  providerChip?: {
    label: string
    people: { name: string; image: string | null }[]
    /** Two answers (several people, or a person + "bez preferencji"): "Specjaliści". */
    plural?: boolean
    /** Renders the editor; `close` folds the field after a pick. */
    editor?: ((close: () => void) => VNode) | null
  }
  /** Why the day came back empty: 'busy' = these people are, others are not. */
  emptyReason?: 'busy'
  /** Drop every specialist pin and ask the day again. */
  onCheckAll?: () => void
  /** Promotion badges per day and per slot key (fail-soft: null = none). */
  /**
   * A badge is an announced reduction: it shows only with the answer's `lowest`
   * (the cart's price and its 30-day price), which the booking summary carries.
   */
  promoBadges?: PromoBadges | null
}) {
  const [editingWho, setEditingWho] = useState(false)
  const inHorizon = useMemo(() => new Set(days), [days])
  const free = (d: string) => (counts[d] ?? 0) > 0

  // Promotion marks (#430): a dot on every bookable day that has one, a corner
  // badge on every promoted hour - never on a day that cannot be picked.
  const badges = promoBadges?.lowest ? promoBadges : null
  const dayMarks = dayPromo(days, (d) => inHorizon.has(d) && free(d), badges?.days)

  const groups = useMemo(() => {
    const keys = slots.slice().sort()
    const g: { label: string; items: { k: string; lab: string }[] }[] = DAY_PARTS.map((label) => ({ label, items: [] }))
    for (const k of keys) {
      const lab = slotLabel(date, k, timezone)
      g[dayPartIndex(parseInt(lab.slice(0, 2), 10))]!.items.push({ k, lab })
    }
    return g.filter((x) => x.items.length)
  }, [slots, date, timezone])

  return (
    <div class="vz-fade-in">
      {providerChip && (
        <div class="vz-who">
          {/* Whose hours these are: a full-width fill field above the calendar. */}
          <button
            type="button"
            class={`vz-who-chip${editingWho ? ' on' : ''}`}
            disabled={!providerChip.editor}
            aria-expanded={providerChip.editor ? (editingWho ? 'true' : 'false') : undefined}
            onClick={() => providerChip.editor && setEditingWho((v) => !v)}
          >
            <AvatarStack people={providerChip.people} max={3} />
            <span class="vz-who-text">
              <span class="vz-who-cap">{providerChip.plural ? 'Specjaliści' : 'Specjalista'}</span>
              <span class="vz-who-label">{providerChip.label}</span>
            </span>
            {providerChip.editor && <ChevronDown size={18} class="vz-chip-cv" />}
          </button>
          {editingWho && providerChip.editor?.(() => setEditingWho(false))}
        </div>
      )}

      {/* The 30-day note of the marks sits in the booking summary, next to the price (#430). */}
      <MonthCalendar days={days} counts={counts} date={date} onPickDate={onPickDate} mark={dayMarks.tile} />

      {!date ? (
        <div style="margin-top:20px;text-align:center;">
          <div class="vz-muted">Wybierz dzień, aby zobaczyć wolne godziny.</div>
          {/* Whole horizon without a free day: the calendar has nothing selectable,
              so the way out has to live here too. */}
          {onFindNext && !noneAhead && !Object.values(counts).some((n) => n > 0) && (
            <button class="vz-btn ghost mt" onClick={onFindNext} disabled={findingNext} type="button">
              {findingNext ? <><Spinner /> Szukam najbliższego terminu…</> : 'Znajdź najbliższy dostępny termin'}
            </button>
          )}
        </div>
      ) : loading ? (
        <div class="vz-center"><Spinner /> Szukam wolnych godzin…</div>
      ) : groups.length === 0 ? (
        <div style="margin-top:20px;text-align:center;">
          {/* Two different empty days, two different ways out: the chosen people
              being busy is not the same as the day being shut. */}
          {emptyReason === 'busy' ? (
            <>
              <div class="vz-muted">Wybrani specjaliści mają tego dnia zajęte grafiki.</div>
              <div class="vz-muted" style="margin-top:4px;">Dostępni są za to inni specjaliści.</div>
              {onCheckAll && (
                <button class="vz-btn ghost mt" onClick={onCheckAll} type="button">
                  Sprawdź wszystkich specjalistów
                </button>
              )}
            </>
          ) : (
            <>
              <div class="vz-muted">
                {noneAhead
                  ? 'Brak wolnych terminów w najbliższym czasie.'
                  : 'Brak dostępnych terminów tego dnia. Wybierz inny.'}
              </div>
              {/* Finding the next free day beats making the customer click through
                  the calendar - the server already sweeps 60 days for us. */}
              {onFindNext && !noneAhead && (
                <button class="vz-btn ghost mt" onClick={onFindNext} disabled={findingNext} type="button">
                  {findingNext ? <><Spinner /> Szukam najbliższego terminu…</> : 'Znajdź najbliższy dostępny termin'}
                </button>
              )}
            </>
          )}
          {canWaitlist && onJoinWaitlist && (
            <button class="vz-btn ghost mt" onClick={onJoinWaitlist} type="button">
              <Bell size={17} /> Powiadom mnie, gdy się zwolni
            </button>
          )}
        </div>
      ) : (
        <>
          <DayHeading date={date} count={slots.length} />
          {groups.map((g) => {
            // Each promoted slot carries its corner badge; a section with one
            // leaves room above its rows for it.
            const marked = g.items.some(({ k }) => !!badges?.slots[k])
            return (
              <div class="vz-slot-group" role="group" aria-label={g.label}>
                <div class="vz-slot-group-h">{g.label}</div>
                <div class={`vz-slots vz-stagger${marked ? ' has-promo' : ''}`}>
                  {g.items.map(({ k, lab }) => {
                    const badge = badges?.slots[k] ?? null
                    return (
                      <button
                        class={`vz-slot${k === selectedSlot ? ' selected' : ''}`}
                        aria-pressed={k === selectedSlot ? 'true' : 'false'}
                        aria-label={badge ? `${lab}, promocja ${badge}` : undefined}
                        onClick={() => onPickSlot(k)}
                        type="button"
                      >
                        {lab}
                        {badge && <PromoBadge corner>{badge}</PromoBadge>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {/* "Dowolny" + a picked hour: name the exact price by naming the person.
              The list is who the ENGINE reported free at that slot. */}
          {slotPicker && slotPicker.candidates.length > 1 && (
            <div class="vz-chain">
              <div class="vz-chain-h">Kto wykona usługę</div>
              <div class="vz-slotpick" role="radiogroup" aria-label="Kto wykona usługę">
                <button
                  type="button"
                  role="radio"
                  aria-checked={slotPicker.selectedId == null}
                  class={`vz-slotpick-b${slotPicker.selectedId == null ? ' on' : ''}`}
                  onClick={() => slotPicker.onPick(null)}
                >
                  Dowolny
                </button>
                {slotPicker.candidates.map((c) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={slotPicker.selectedId === c.id}
                    class={`vz-slotpick-b${slotPicker.selectedId === c.id ? ' on' : ''}`}
                    onClick={() => slotPicker.onPick(c.id)}
                  >
                    {c.name} <span class="vz-slotpick-p">{c.price}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* What the visit will actually look like, once a start is picked. */}
          {chain && chain.rows.length > 1 && (
            <div class="vz-chain">
              <div class="vz-chain-h">Przebieg wizyty</div>
              {chain.rows.map((r) => (
                <div class="vz-chain-row">
                  <span class="vz-chain-time">{r.time}</span>
                  <span class="vz-chain-name">{r.name}</span>
                  <span class="vz-chain-dur">{r.duration}</span>
                </div>
              ))}
              <div class="vz-chain-total">Łącznie: {chain.total}</div>
            </div>
          )}
          {canWaitlist && onJoinWaitlist && (
            <button class="vz-wl-link" onClick={onJoinWaitlist} type="button">
              <Bell size={14} /> Nie pasuje żaden termin? Powiadom mnie, gdy się zwolni.
            </button>
          )}
        </>
      )}
    </div>
  )
}

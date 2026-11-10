// Restaurant tables (vizyto #903 F11): the pure rules of the "Stolik" family.
//
// A local twin of `packages/shared/src/utils/tableBooking.ts` and the period grid of
// `TablePeriodSlots` in the Vizyto monorepo. The widget is built and released on its
// own and cannot import @vizyto/shared (same stance as findStaffPromotion), so the
// few rules it needs live here, free of fetch and DOM code - which is also what lets
// `tests/tables.test.js` import them directly.

/** Why a start is not bookable. `past` starts are never shown; the rest render grey. */
export type TableSlotReason = 'past' | 'service_end' | 'pace' | 'taken'
/** One offered start. `time` is the venue's local wall time ("19:30"). */
export type TableSlot = { startAt: string; time: string; available: boolean; reason?: TableSlotReason }
export type TablePeriod = { periodId: number; name: string; lastSeating: string; slots: TableSlot[] }
export type TableDay = { date: string; guests: number; durationMinutes: number; periods: TablePeriod[] }
export type TableZone = { id: number; name: string }
export type TableOptions = {
  zones: TableZone[]
  confirmationMode: 'auto' | 'manual'
  assignmentMode?: string
  lateAfterMinutes: number
  maxAdults: number
  maxChildren: number
}

export const MAX_ADULTS = 10
export const MAX_CHILDREN = 4
export const DEFAULT_ADULTS = 2
/** The API refuses a counts range longer than this (422 TABLE_COUNTS_RANGE). */
export const COUNTS_MAX_DAYS = 31

/**
 * Whether the business takes table reservations online. Strict on purpose, like the
 * shared `publicTablesBookable`: the module is a pilot, so a payload without the
 * capability list (an older API) offers no table, and a suspended plan hides it.
 * Channel policy stays with the server, as for every other family in the widget.
 */
export function tablesBookable(b: { capabilities?: unknown; bookingSuspended?: boolean } | null | undefined): boolean {
  const caps = b?.capabilities
  return Array.isArray(caps) && caps.includes('tables') && b?.bookingSuspended !== true
}

/** The party pills' upper bounds; the venue's limits when known, else the API's. */
export function partyRange(options: Pick<TableOptions, 'maxAdults' | 'maxChildren'> | null | undefined) {
  return { maxAdults: options?.maxAdults ?? MAX_ADULTS, maxChildren: options?.maxChildren ?? MAX_CHILDREN }
}

/** The periods as the guest sees them: past starts dropped, then empty periods. */
export function visiblePeriods(day: Pick<TableDay, 'periods'> | null | undefined): TablePeriod[] {
  if (!day) return []
  return day.periods
    .map((p) => ({ ...p, slots: p.slots.filter((s) => s.reason !== 'past') }))
    .filter((p) => p.slots.length > 0)
}

/** At least one shown start is grey (no table for this party). */
export const anyGrey = (periods: TablePeriod[]) => periods.some((p) => p.slots.some((s) => !s.available))

/** No free start at all on the day: the waitlist path. */
export const tableDayEmpty = (day: Pick<TableDay, 'periods'> | null | undefined) =>
  !!day && !day.periods.some((p) => p.slots.some((s) => s.available))

/** Every offered start is behind the booking notice: nothing left to wait for. */
export const tableDayOver = (periods: Array<{ slots: Array<{ reason?: string }> }>) =>
  periods.length > 0 && periods.every((p) => p.slots.every((s) => s.reason === 'past'))

/** Create refusals that mean "pick another hour". */
export const TABLE_SLOT_GONE: ReadonlySet<string> = new Set(['TABLE_NOT_AVAILABLE', 'TABLE_TOO_LATE', 'TABLE_OUTSIDE_SERVICE'])

/** A reservation that failed without a refusal to name (a server error, no answer the API worded). */
export const TABLE_FAILED = 'Nie udało się zarezerwować stolika. Spróbuj ponownie.'

/**
 * The guest's sentence for a refused reservation. A table code carries the API's own
 * Polish message, which wins; the local text covers an older API without one.
 */
export function tableErrorMessage(code: string, message?: string | null): string {
  if (code.startsWith('TABLE') && message) return message
  switch (code) {
    case 'TABLE_NOT_AVAILABLE':
      return 'O tej godzinie nie ma już wolnego stolika. Wybierz inną.'
    case 'TABLE_TOO_LATE':
      return 'Na tę godzinę nie można już zarezerwować stolika. Wybierz inną.'
    case 'TABLE_OUTSIDE_SERVICE':
      return 'O tej godzinie lokal nie przyjmuje rezerwacji. Wybierz inną.'
    case 'TABLE_ZONE_NOT_FOUND':
      return 'Ta strefa nie przyjmuje już rezerwacji. Wybierz inną.'
    case 'TABLES_NOT_AVAILABLE':
      return 'Ten lokal nie przyjmuje rezerwacji stolików.'
    case 'INCOMPLETE_PROFILE':
      return 'Uzupełnij imię, nazwisko i numer telefonu, aby zarezerwować.'
    default:
      return TABLE_FAILED
  }
}

/** The guest's sentence for a refused table waitlist sign-up. */
export function tableWaitlistErrorMessage(code: string): string {
  switch (code) {
    case 'WAITLIST_DUPLICATE':
      return 'Już czekasz na stolik w tym dniu.'
    case 'WAITLIST_LIMIT_REACHED':
      return 'Masz już 3 aktywne zapisy w tym lokalu - usuń któryś w profilu Vizyto, aby dodać nowy.'
    case 'WAITLIST_DISABLED':
      return 'Ten lokal nie prowadzi listy oczekujących.'
    case 'WAITLIST_WINDOW_CLOSED':
      return 'Na ten dzień nie można już zapisać się na listę.'
    case 'INCOMPLETE_PROFILE':
      return 'Uzupełnij imię, nazwisko i telefon, aby zapisać się na listę.'
    case 'NETWORK':
      return 'Brak połączenia. Spróbuj ponownie.'
    default:
      return 'Nie udało się zapisać na listę. Spróbuj ponownie.'
  }
}

/** Polish count noun: forms for 1, for 2-4 (not 12-14), and for the rest. */
export function plural(n: number, forms: [string, string, string]): string {
  const last = n % 10
  const teens = n % 100
  if (n === 1) return forms[0]
  if (last >= 2 && last <= 4 && (teens < 12 || teens > 14)) return forms[1]
  return forms[2]
}

/** "1 osoba", "2 osoby", "5 osób". */
export const tablePartyLabel = (n: number) => `${n} ${plural(n, ['osoba', 'osoby', 'osób'])}`

/**
 * After "dla" the count takes the genitive: "dla 1 osoby", "dla 2 osób", "dla 5 osób"
 * (the nominative "2 osoby" would be wrong there).
 */
export const partyGenitive = (n: number) => `${n} ${n === 1 ? 'osoby' : 'osób'}`

/** "w tym 1 dziecko", "w tym 2 dzieci". */
export const childrenLine = (n: number) => `w tym ${n} ${n === 1 ? 'dziecko' : 'dzieci'}`

/** How long the venue holds the table after the reserved time. */
export const holdRule = (lateAfterMinutes: number) =>
  `Lokal trzyma stolik ${lateAfterMinutes} ${plural(lateAfterMinutes, ['minutę', 'minuty', 'minut'])} po godzinie rezerwacji.`

export const TABLE_CANCEL_RULE = 'Rezerwację możesz odwołać do godziny rezerwacji.'

/**
 * Deterministic Idempotency-Key, like the rental key: it must survive a remount and
 * the phone-verification detour, and change with anything that makes it another
 * reservation (start, party, zone, booker).
 */
export function tableIdempotencyKey(p: {
  businessId: number
  startAt: string
  adults: number
  children: number
  zoneId: number | null | undefined
  userId: number
}): string {
  return `vzw-tbl-${p.businessId}-${p.startAt}-${p.adults}-${p.children}-${p.zoneId ?? 'any'}-${p.userId}`
}

/** The day strip's horizon split into ranges the counts endpoint accepts. */
export function countsWindow(days: string[], max = COUNTS_MAX_DAYS): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = []
  for (let i = 0; i < days.length; i += max) {
    const chunk = days.slice(i, i + max)
    out.push({ from: chunk[0]!, to: chunk[chunk.length - 1]! })
  }
  return out
}

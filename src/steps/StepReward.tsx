import { useEffect, useId, useRef } from 'preact/hooks'
import type { LoyaltyCatalogReward, LoyaltyProgramPublic, LoyaltyWallet } from '../api'
import {
  amountDueSentence,
  blockedKeptNote,
  blockedReason,
  claimFootnote,
  claimHeading,
  costLine,
  currentPriceLine,
  formatPersonalTotalInline,
  programIntro,
  rewardBenefit,
  rewardNotes,
  rewardValidityLine,
  type BlockedReward,
  type BookingRewardLine,
  type ClaimableReward,
  type RewardFlow,
  type UsableReward,
} from '../loyalty'
import { StepHeader } from '../ui/StepHeader'
import { SelectCard } from '../ui/SelectCard'
import { Notice } from '../ui/Notice'
import { Button } from '../ui/Button'
import { SummaryCard } from '../ui/SummaryCard'
import { Disclosure, LoyaltyProgress, ProgramRules, ProgramTerms } from './LoyaltyProgram'

export type RewardNotice = { title: string; text: string; tone?: 'warn' | 'plain' }

/**
 * "Nagroda" (vizyto #471 F37): after the customer is known, keep the current
 * price or use one of their rewards, each with the price the server quoted
 * ("Obecna cena: 72,00 zł", "Z nagrodą: 50,00 zł"). Rewards this booking cannot
 * take say why; catalog rewards the balance pays for can be claimed in place and
 * are chosen once priced. Ported from the shared BookingRewardChoice (CLIENT and
 * WEB summary), as its own step because the widget learns who books only at the
 * end. The flow shows it only when there is a reward to use or to claim.
 */
export function StepReward({
  flow,
  program,
  wallet,
  catalog,
  lines,
  ordinaryTotal,
  usable,
  blocked,
  claimables,
  choice,
  onChoose,
  onRetry,
  claimOpen,
  claimBusy,
  claimError,
  onOpenClaim,
  onCancelClaim,
  onConfirmClaim,
  notice,
  serviceNames,
}: {
  flow: RewardFlow
  program: LoyaltyProgramPublic
  wallet: LoyaltyWallet
  catalog: readonly LoyaltyCatalogReward[]
  lines: readonly BookingRewardLine[]
  ordinaryTotal: number | null
  usable: UsableReward[]
  blocked: BlockedReward[]
  claimables: ClaimableReward[]
  choice: number | null
  onChoose: (rewardId: number | null) => void
  onRetry: (rewardId: number) => void
  /** The catalog entry whose claim is being confirmed. */
  claimOpen: number | null
  claimBusy: boolean
  claimError: string
  onOpenClaim: (item: ClaimableReward) => void
  onCancelClaim: () => void
  onConfirmClaim: () => void
  notice: RewardNotice | null
  /** Service names, to name the item of a free service. */
  serviceNames: ReadonlyMap<number, string>
}) {
  const stamps = !!wallet.stamps
  const chosen = choice != null ? usable.find((item) => item.reward.id === choice) ?? null : null
  const chosenQuote = chosen?.quote?.status === 'ok' ? chosen.quote.quote : null
  const claimHeadingId = useId()

  return (
    <div class="vz-fade-in">
      <StepHeader title="Nagroda" />
      {notice && <Notice title={notice.title} tone={notice.tone}>{notice.text || undefined}</Notice>}

      <div class="vz-rw">
        <LoyaltyProgress wallet={wallet} />

        {/* The price of the chosen reward, for screen readers: it arrives after the tap. */}
        <p class="vz-sr" aria-live="polite">
          {chosen && chosenQuote ? `${chosen.reward.termsSnapshot.name}. ${amountDueSentence(chosenQuote.total)}` : ''}
        </p>

        {usable.length > 0 && (
          <div class="vz-list" role="radiogroup" aria-label="Nagroda">
            <SelectCard
              title="Bez nagrody"
              sub={currentPriceLine(ordinaryTotal)}
              selected={choice == null}
              onSelect={() => onChoose(null)}
            />
            {usable.map((item) => (
              <RewardOption
                key={item.reward.id}
                item={item}
                lines={lines}
                checked={choice === item.reward.id}
                onChoose={() => onChoose(item.reward.id)}
                onRetry={() => onRetry(item.reward.id)}
              />
            ))}
          </div>
        )}

        {blocked.map((item) => <BlockedNotice key={item.reward.id} item={item} flow={flow} />)}

        {claimables.length > 0 && (
          <section class="vz-rw-section" aria-labelledby={claimHeadingId}>
            <div class="vz-rw-h" id={claimHeadingId}>{claimHeading(stamps)}</div>
            {claimError && <div class="vz-err vz-rw-err" role="alert">{claimError}</div>}
            <div class="vz-list">
              {claimables.map((item) => item.catalog.id === claimOpen ? (
                <ClaimConfirm
                  key={item.catalog.id}
                  item={item}
                  stamps={stamps}
                  balance={wallet.balance}
                  busy={claimBusy}
                  serviceNames={serviceNames}
                  onConfirm={onConfirmClaim}
                  onCancel={onCancelClaim}
                />
              ) : (
                <div class="vz-rw-claim" key={item.catalog.id}>
                  <span class="vz-rw-claim-main">
                    <span class="vz-card-title">{item.catalog.name}</span>
                    <span class="vz-card-sub">{costLine(item.cost, stamps)}</span>
                  </span>
                  <button
                    class="vz-mini-btn"
                    type="button"
                    onClick={() => onOpenClaim(item)}
                    disabled={claimBusy}
                    aria-label={`Odbierz: ${item.catalog.name}`}
                  >
                    Odbierz
                  </button>
                </div>
              ))}
            </div>
            <p class="vz-lp-muted">{claimFootnote(wallet.balance, stamps)}</p>
          </section>
        )}

        <Disclosure title="Program lojalnościowy">
          <p>{programIntro(program)}</p>
          <ProgramRules program={program} catalog={catalog} />
          <ProgramTerms program={program} />
        </Disclosure>
      </div>
    </div>
  )
}

function RewardOption({ item, lines, checked, onChoose, onRetry }: {
  item: UsableReward
  lines: readonly BookingRewardLine[]
  checked: boolean
  onChoose: () => void
  onRetry: () => void
}) {
  const notesId = useId()
  const failed = item.quote?.status === 'error'
  const loading = !item.quote || item.quote.status === 'loading'
  const quote = item.quote?.status === 'ok' ? item.quote.quote : null
  const notes = failed ? [] : rewardNotes(item, lines, quote)
  return (
    <div class="vz-rw-opt">
      <SelectCard
        title={item.reward.termsSnapshot.name}
        selected={checked}
        // Without its price the reward cannot be chosen; the price is asked for again below.
        disabled={failed}
        onSelect={onChoose}
        busy={loading}
        describedBy={failed || notes.length ? notesId : undefined}
        meta={
          <>
            {!failed && (
              <span class="vz-rw-price">
                Z nagrodą:{' '}
                {loading || !quote ? <span class="vz-skel" aria-hidden="true" /> : formatPersonalTotalInline(quote.total)}
              </span>
            )}
            {notes.length > 0 && (
              <span class="vz-rw-notes" id={notesId} aria-hidden="true">
                {notes.map((note) => <span key={note}>{note}</span>)}
              </span>
            )}
          </>
        }
      />
      {failed && (
        // Outside the disabled card, so the reason keeps its full contrast.
        <div class="vz-rw-fail">
          <span id={notesId}>Nie udało się policzyć ceny z nagrodą.</span>
          <button class="vz-link" type="button" onClick={onRetry}>Spróbuj ponownie</button>
        </div>
      )}
    </div>
  )
}

function BlockedNotice({ item, flow }: { item: BlockedReward; flow: RewardFlow }) {
  const reason = blockedReason(item)
  const rows = item.reason === 'promotion' ? item.lines : [null]
  return (
    <div class="vz-rw-blocked">
      <div class="vz-rw-bname">{item.reward.termsSnapshot.name}</div>
      {rows.map((line, i) => (
        // The status sits on the first row only, so the reason keeps the card's full width.
        <div class="vz-rw-brow" key={line?.index ?? `r${i}`}>
          <div class="vz-rw-brow-top">
            {line ? <span>{line.name}</span> : <span class="vz-lp-muted">{reason}</span>}
            <span class="vz-rw-badge">Niedostępna</span>
          </div>
          {line && <span class="vz-lp-muted">{reason}</span>}
        </div>
      ))}
      <p class="vz-lp-muted">{blockedKeptNote(item.reason, flow)}</p>
    </div>
  )
}

/**
 * The claim, confirmed in place of the row (the WEB claim sheet's facts): what it
 * gives, what it costs, what is left and how long it lasts.
 */
function ClaimConfirm({ item, stamps, balance, busy, serviceNames, onConfirm, onCancel }: {
  item: ClaimableReward
  stamps: boolean
  balance: number
  busy: boolean
  serviceNames: ReadonlyMap<number, string>
  onConfirm: () => void
  onCancel: () => void
}) {
  const titleRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // The row's button is gone: keyboard and screen-reader focus follow the panel.
  useEffect(() => { titleRef.current?.focus() }, [])
  const entry = item.catalog
  const target = entry.targets.find((t) => t.targetKey === item.targetKey) ?? null
  const freeName = entry.kind === 'free_item' && target?.businessServiceId ? serviceNames.get(target.businessServiceId) ?? null : null
  const benefit = freeName ? `Darmowa usługa: ${freeName}` : rewardBenefit({ ...entry, targets: target ? [target] : entry.targets })
  return (
    <div class="vz-rw-confirm" role="group" aria-labelledby={titleId}>
      <div class="vz-card-title vz-rw-confirm-title" id={titleId} ref={titleRef} tabIndex={-1}>{entry.name}</div>
      <SummaryCard
        rows={[
          { label: 'Korzyść', value: benefit },
          { label: stamps ? 'Pieczątki' : 'Koszt', value: String(item.cost) },
          { label: stamps ? 'Pieczątki po odebraniu' : 'Saldo po odebraniu', value: String(balance - item.cost) },
          { label: 'Ważność', value: rewardValidityLine(entry.validityDays) },
        ]}
      />
      <Button onClick={onConfirm} loading={busy}>Odbierz</Button>
      <Button variant="ghost" onClick={onCancel} disabled={busy}>Anuluj</Button>
    </div>
  )
}

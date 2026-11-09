import type { ComponentChildren } from 'preact'
import { useId } from 'preact/hooks'
import type { LoyaltyCatalogReward, LoyaltyProgramPublic, LoyaltyWallet } from '../api'
import { negativeBalanceLine, programIntro, programRules, progressLines } from '../loyalty'
import { ChevronDown } from '../ui/icons'

/**
 * The business's own loyalty program, as the WEB profile describes it (vizyto
 * #471 F29/F37): what is collected here, where the customer stands, how it works
 * and the program's terms. Only this business's program and its own terms text;
 * nothing here promises Points for a booking, which staff award at settlement.
 */

/** Where the customer stands: "Punkty: 120", "Poziom: Srebrny", "Do poziomu Złoty: 30". */
export function LoyaltyProgress({ wallet }: { wallet: LoyaltyWallet }) {
  const negative = negativeBalanceLine(wallet)
  return (
    <>
      <ul class="vz-lp-progress" aria-label="Twoja karta">
        {progressLines(wallet).map((line) => <li key={line}>{line}</li>)}
      </ul>
      {negative && <p class="vz-lp-muted">{negative}</p>}
    </>
  )
}

/** A collapsed section: the native disclosure, keyboard and screen readers included. */
export function Disclosure({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <details class="vz-details">
      <summary>
        <span>{title}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div class="vz-details-body">{children}</div>
    </details>
  )
}

/** "Jak to działa": earn rules (or the stamp card's rules) and how long things last. */
export function ProgramRules({ program, catalog }: { program: LoyaltyProgramPublic; catalog: readonly LoyaltyCatalogReward[] }) {
  return (
    <dl class="vz-lp-rules">
      {programRules(program, catalog).map((row) => (
        <div class="vz-lp-rule" key={`${row.title}-${row.text}`}>
          <dt>{row.title}</dt>
          <dd>
            <span>{row.text}</span>
            {row.value && <b class="vz-lp-value">{row.value}</b>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** The program's own terms, as the business wrote them (plain text, line breaks kept). */
export function ProgramTerms({ program }: { program: LoyaltyProgramPublic }) {
  const text = program.termsText?.trim()
  if (!text) return null
  return (
    <Disclosure title="Regulamin programu">
      <div class="vz-notice-pre">{text}</div>
    </Disclosure>
  )
}

/** The compact block of the success screen. */
export function LoyaltyProgramBlock({
  program,
  wallet,
  catalog,
}: {
  program: LoyaltyProgramPublic
  /** Null when the customer has no card here yet (a first booking): the intro only. */
  wallet: LoyaltyWallet | null
  catalog: readonly LoyaltyCatalogReward[]
}) {
  const headingId = useId()
  return (
    <section class="vz-lp" aria-labelledby={headingId}>
      <div class="vz-lp-h" id={headingId}>Program lojalnościowy</div>
      <p class="vz-lp-intro">{programIntro(program)}</p>
      {wallet && <LoyaltyProgress wallet={wallet} />}
      <Disclosure title="Jak to działa">
        <ProgramRules program={program} catalog={catalog} />
      </Disclosure>
      <ProgramTerms program={program} />
    </section>
  )
}

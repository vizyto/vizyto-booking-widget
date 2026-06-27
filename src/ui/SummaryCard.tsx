export type SummaryRow = { label: string; value: string; total?: boolean }

export function SummaryCard({ rows }: { rows: SummaryRow[] }) {
  return (
    <div class="vz-summary">
      {rows.map((r) => (
        <div class={`vz-row${r.total ? ' total' : ''}`}>
          <span>{r.label}</span>
          <span>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

// Segmented "KROK X Z N" progress, matching the Vizyto app.
export function ProgressBar({ step, total, label }: { step: number; total: number; label: string }) {
  return (
    <div class="vz-prog">
      <div class="vz-prog-head">
        <span class="vz-prog-krok">KROK {step + 1} Z {total}</span>
        <span class="vz-prog-name">{label}</span>
      </div>
      <div class="vz-prog-bars" aria-hidden="true">
        {Array.from({ length: total }).map((_, i) => (
          <span class={`vz-prog-bar${i <= step ? ' on' : ''}`} />
        ))}
      </div>
    </div>
  )
}

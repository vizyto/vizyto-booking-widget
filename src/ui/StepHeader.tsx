import { useEffect, useRef } from 'preact/hooks'
import { ArrowLeft } from './icons'

// Title is focused on mount so each step transition moves screen-reader + keyboard
// focus to the new heading (tabindex=-1, not in the tab order otherwise).
export function StepHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const h = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    h.current?.focus()
  }, [])
  return (
    <div class="vz-h">
      {onBack && (
        <button class="vz-back" onClick={onBack} aria-label="Wstecz" type="button">
          <ArrowLeft />
        </button>
      )}
      <h2 ref={h} tabIndex={-1}>{title}</h2>
    </div>
  )
}

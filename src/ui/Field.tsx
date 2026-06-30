import { useMemo } from 'preact/hooks'
import type { ComponentChildren, JSX } from 'preact'

let seq = 0

export function Field({
  label,
  value,
  onInput,
  onBlur,
  type = 'text',
  inputMode,
  autoComplete,
  placeholder,
  error,
  full,
  enterKeyHint,
  icon,
}: {
  label: string
  value: string
  onInput: (v: string) => void
  onBlur?: () => void
  type?: string
  inputMode?: JSX.HTMLAttributes<HTMLInputElement>['inputMode']
  autoComplete?: string
  placeholder?: string
  error?: string
  full?: boolean
  enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send'
  icon?: ComponentChildren
}) {
  const id = useMemo(() => `vz-f${++seq}`, [])
  const errId = `${id}-e`
  return (
    <div class={`vz-field${full ? ' full' : ''}`}>
      <label class="vz-label" for={id}>{label}</label>
      <div class={`vz-input-wrap${icon ? ' has-icon' : ''}`}>
        <input
          id={id}
          class={`vz-input${error ? ' invalid' : ''}`}
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          {...(enterKeyHint ? { enterkeyhint: enterKeyHint } : {})}
          placeholder={placeholder}
          value={value}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errId : undefined}
          onInput={(e) => onInput((e.target as HTMLInputElement).value)}
          onBlur={onBlur}
        />
        {icon && <span class="vz-input-icon" aria-hidden="true">{icon}</span>}
      </div>
      {error && <span id={errId} class="vz-field-err">{error}</span>}
    </div>
  )
}

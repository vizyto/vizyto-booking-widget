import { useEffect, useRef, useState } from 'preact/hooks'

const LEN = 4

// One real <input> (transparent, full-bleed) drives four visual boxes. A single
// input is the most reliable target for iOS/Android SMS autofill
// (autocomplete="one-time-code") and for paste, and keeps the markup tiny.
export function OtpInput({
  value,
  onInput,
  onComplete,
  disabled,
  invalid,
}: {
  value: string
  onInput: (v: string) => void
  onComplete: (v: string) => void
  disabled?: boolean
  invalid?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!disabled) ref.current?.focus()
  }, [disabled])

  function handle(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, LEN)
    onInput(digits)
    if (digits.length === LEN) onComplete(digits)
  }

  return (
    <div class={`vz-otp-wrap${invalid ? ' invalid' : ''}`}>
      <input
        ref={ref}
        class="vz-otp-input"
        value={value}
        disabled={disabled}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={LEN}
        aria-label="Kod weryfikacyjny"
        onInput={(e) => handle((e.target as HTMLInputElement).value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <div class="vz-otp-boxes">
        {Array.from({ length: LEN }).map((_, i) => (
          <div class={`vz-otp-box${value[i] ? ' filled' : ''}${focused && i === value.length ? ' cursor' : ''}`}>
            {value[i] ?? ''}
          </div>
        ))}
      </div>
    </div>
  )
}

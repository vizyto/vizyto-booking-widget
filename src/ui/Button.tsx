import type { ComponentChildren } from 'preact'
import { Spinner } from './Spinner'

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled,
  loading,
}: {
  children: ComponentChildren
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'primary' | 'ghost'
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <button
      type={type}
      class={`vz-btn${variant === 'ghost' ? ' ghost' : ''}`}
      disabled={disabled || loading}
      aria-busy={loading ? 'true' : undefined}
      onClick={onClick}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

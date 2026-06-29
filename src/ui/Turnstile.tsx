import { useEffect, useRef } from 'preact/hooks'

// Cloudflare Turnstile gate for the SMS-OTP path (anti-toll-fraud). The host page
// renders this with the PUBLIC site key; on solve we lift the token up and the
// booking flow sends it as `turnstileToken` on /guest/otp/send. The secret-key
// verification happens server-side - nothing secret lives here.
//
// Loaded with the explicit-render API so we control exactly when/where the widget
// mounts (it sits inside the widget's Shadow DOM). The script itself is injected
// into the main document once - an @font-face-style document-level resource.

let scriptPromise: Promise<void> | null = null
function loadTurnstile(): Promise<void> {
  if ((window as any).turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('turnstile script failed to load'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

export function Turnstile({
  siteKey,
  onToken,
  theme,
}: {
  siteKey: string
  onToken: (token: string | null) => void
  theme?: 'light' | 'dark' | 'auto'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadTurnstile()
      .then(() => {
        if (cancelled || !ref.current) return
        const ts = (window as any).turnstile
        if (!ts) return
        widgetId.current = ts.render(ref.current, {
          sitekey: siteKey,
          theme: theme || 'auto',
          callback: (token: string) => onToken(token),
          // Token expired (~5 min) or errored -> drop it so the submit re-gates.
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        })
      })
      .catch(() => onToken(null))

    return () => {
      cancelled = true
      try {
        if (widgetId.current) (window as any).turnstile?.remove(widgetId.current)
      } catch {}
      widgetId.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey])

  return <div ref={ref} class="vz-turnstile" />
}

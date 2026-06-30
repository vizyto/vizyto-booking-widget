import { h, render } from 'preact'
import { Widget, type WidgetController } from './Widget'
import { css } from './styles'
import type { Cfg } from './api'
import type { Prefill } from './BookingFlow'
import { createEmitter, off, on, type EventHandler } from './events'

type ThemePref = 'light' | 'dark' | 'auto'

export type MountConfig = {
  businessId: number
  siteKey?: string
  turnstileKey?: string // Cloudflare Turnstile PUBLIC site key (gates the SMS-OTP path)
  apiBase?: string // origin, or "mock" for the offline dev backend
  accent?: string
  label?: string
  theme?: ThemePref
  font?: 'on' | 'off'
  token?: string
  userId?: number
  inline?: boolean | string | HTMLElement // selector/element to mount into, or true (no <div> needed)
  showLauncher?: boolean // false = no floating button; open only via VizytoBooking.open()
  onEvent?: EventHandler // funnel events (service_selected, booking_completed, ...) - see README
  dataLayer?: boolean // false = don't push events to window.dataLayer (GTM/GA); default true
}

const darkMql = () => window.matchMedia('(prefers-color-scheme: dark)')
const resolveDark = (pref: ThemePref) => pref === 'dark' || (pref === 'auto' && darkMql().matches)
const applyTheme = (root: HTMLElement, pref: ThemePref) =>
  root.setAttribute('data-theme', resolveDark(pref) ? 'dark' : 'light')

// Poppins (the Vizyto app font) is registered at the document level - an
// @font-face inside a Shadow DOM <style> is unreliable across browsers. Injected
// once, guarded by a marker; opt out with font:'off'.
function injectFont() {
  if (document.querySelector('link[data-vizyto-fonts]')) return
  const pre1 = Object.assign(document.createElement('link'), { rel: 'preconnect', href: 'https://fonts.googleapis.com' })
  const pre2 = Object.assign(document.createElement('link'), { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' })
  const sheet = document.createElement('link')
  sheet.rel = 'stylesheet'
  sheet.setAttribute('data-vizyto-fonts', '')
  sheet.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap'
  document.head.append(pre1, pre2, sheet)
}

const instances: { host: HTMLElement; root: HTMLElement; cleanup?: () => void; controller?: WidgetController }[] = []
let activeController: WidgetController | null = null // most-recent launcher instance

export function mount(config: MountConfig): HTMLElement | null {
  if (!config?.businessId) {
    console.warn('[vizyto] mount() needs a businessId - nothing to mount')
    return null
  }

  const apiRaw = config.apiBase || 'https://api.vizyto.com'
  const mock = apiRaw === 'mock'
  const cfg: Cfg = {
    businessId: config.businessId,
    siteKey: config.siteKey || '',
    turnstileKey: config.turnstileKey || undefined,
    apiBase: mock ? 'mock' : apiRaw.replace(/\/+$/, ''),
    token: config.token || undefined,
    mock,
  }
  const accent = config.accent || '#fd9320'
  const label = config.label || 'Zarezerwuj wizytę'
  const themePref = (['light', 'dark', 'auto'].includes(config.theme || '') ? config.theme : 'light') as ThemePref
  const preAuth = cfg.token && config.userId ? { userId: config.userId, token: cfg.token } : undefined
  if (config.font !== 'off') injectFont()

  let target: HTMLElement | null = null
  let inline = false
  if (config.inline instanceof HTMLElement) {
    target = config.inline
    inline = true
  } else if (typeof config.inline === 'string') {
    target = document.querySelector<HTMLElement>(config.inline)
    inline = true
  } else if (config.inline === true) {
    inline = true
  }
  const mode: 'launcher' | 'inline' = inline ? 'inline' : 'launcher'

  const host = document.createElement('div')
  host.setAttribute('data-vizyto-widget', '')
  ;(target || document.body).appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = css
  shadow.appendChild(style)

  const root = document.createElement('div')
  root.className = 'vz-root'
  root.style.setProperty('--vz-accent', accent)
  applyTheme(root, themePref)
  shadow.appendChild(root)

  let cleanup: (() => void) | undefined
  if (themePref === 'auto') {
    const mql = darkMql()
    const onChange = () => applyTheme(root, 'auto')
    mql.addEventListener?.('change', onChange)
    cleanup = () => mql.removeEventListener?.('change', onChange)
  }

  const showLauncher = config.showLauncher !== false
  const emit = createEmitter({ businessId: config.businessId, onEvent: config.onEvent, dataLayer: config.dataLayer })
  const controller: WidgetController = {}
  render(h(Widget, { cfg, mode, label, preAuth, showLauncher, controller, emit }), root)
  instances.push({ host, root, cleanup, controller })
  if (mode === 'launcher') activeController = controller
  return host
}

export function unmount() {
  for (const i of instances) {
    try {
      render(null as any, i.root)
    } catch {}
    i.cleanup?.()
    i.host.remove()
  }
  instances.length = 0
  activeController = null
  document.querySelectorAll('[data-vizyto-widget]').forEach((el) => el.remove())
}

// Open/close the modal of the most-recently-mounted launcher instance. Prefill
// optionally jumps to a service/specialist (e.g. a "book this barber" CTA).
export function open(prefill?: Prefill) {
  if (!activeController?.open) {
    console.warn('[vizyto] open() called but no launcher instance is mounted')
    return
  }
  activeController.open(prefill)
}

export function close() {
  activeController?.close?.()
}

function findScript(): HTMLScriptElement | null {
  if (document.currentScript && (document.currentScript as HTMLScriptElement).dataset.vizytoBusiness)
    return document.currentScript as HTMLScriptElement
  return document.querySelector<HTMLScriptElement>('script[data-vizyto-business]')
}

function mountFromScript() {
  const script = findScript()
  if (!script) return // no embed tag on the page (e.g. demo driving mount() itself)
  const ds = script.dataset
  const businessId = Number(ds.vizytoBusiness)
  if (!businessId) {
    console.warn('[vizyto] missing data-vizyto-business on the <script> tag - nothing to mount')
    return
  }
  const inlineTarget = document.querySelector<HTMLElement>('[data-vizyto-booking]')
  mount({
    businessId,
    siteKey: ds.vizytoKey,
    turnstileKey: ds.vizytoTurnstile,
    apiBase: ds.vizytoApi,
    accent: ds.vizytoAccent,
    label: ds.vizytoLabel,
    theme: ds.vizytoTheme as ThemePref,
    font: ds.vizytoFont === 'off' ? 'off' : 'on',
    token: ds.vizytoToken,
    userId: Number(ds.vizytoUser) || undefined,
    inline: inlineTarget || ds.vizytoInline != null,
    showLauncher: ds.vizytoLauncher !== 'hidden',
    dataLayer: ds.vizytoDatalayer !== 'off',
  })
}

;(window as any).VizytoBooking = { mount, unmount, open, close, on, off }

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountFromScript)
else mountFromScript()

import { h, render } from 'preact'
import { Widget } from './Widget'
import { css } from './styles'
import type { Cfg } from './api'

function findScript(): HTMLScriptElement | null {
  if (document.currentScript && (document.currentScript as HTMLScriptElement).dataset.vizytoBusiness)
    return document.currentScript as HTMLScriptElement
  return document.querySelector<HTMLScriptElement>('script[data-vizyto-business]')
}

function mount() {
  const script = findScript()
  const ds = script?.dataset ?? ({} as DOMStringMap)
  const businessId = Number(ds.vizytoBusiness)
  if (!businessId) {
    console.warn('[vizyto] missing data-vizyto-business on the <script> tag - nothing to mount')
    return
  }

  const cfg: Cfg = {
    businessId,
    siteKey: ds.vizytoKey || '',
    apiBase: (ds.vizytoApi || 'https://api.vizyto.com').replace(/\/+$/, ''),
  }
  const accent = ds.vizytoAccent || '#fd9320'
  const label = ds.vizytoLabel || 'Zarezerwuj wizytę'

  const inlineTarget = document.querySelector<HTMLElement>('[data-vizyto-booking]')
  const mode: 'launcher' | 'inline' = inlineTarget || ds.vizytoInline != null ? 'inline' : 'launcher'

  const host = document.createElement('div')
  host.setAttribute('data-vizyto-widget', '')
  ;(inlineTarget || document.body).appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = css
  shadow.appendChild(style)

  const root = document.createElement('div')
  root.className = 'vz-root'
  root.style.setProperty('--vz-accent', accent)
  shadow.appendChild(root)

  render(h(Widget, { cfg, mode, label }), root)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount)
else mount()

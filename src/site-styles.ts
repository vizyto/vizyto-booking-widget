import fontPacks from './font-packs.json'

export function resolveWidgetOrigin(scriptSrc?: string): string {
  try {
    const url = new URL(scriptSrc || '')
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin
  } catch {}
  return 'https://widget.vizyto.com'
}

// Capture during classic script execution, including dynamically inserted scripts.
// currentScript is null by the time a deferred mount() registers fonts.
const widgetOrigin = resolveWidgetOrigin(
  typeof document === 'undefined' ? undefined : (document.currentScript as HTMLScriptElement | null)?.src,
)

export { fontPacks }
export type FontPackId = keyof typeof fontPacks
export type ThemePref = 'light' | 'dark' | 'auto'
export type SiteStyleConfig = {
  fontPackId?: string
  font?: 'on' | 'off'
  theme?: ThemePref
  accent?: string
  accentLight?: string
  accentDark?: string
  onAccent?: string
}
export const DEFAULT_FONT_PACK: FontPackId = 'oswald-poppins-v1'
export const SYSTEM_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
export const DEFAULT_COLORS = {
  accent: '#fd9320', accentLight: '#ffdca8', accentDark: '#bf700f', onAccent: '#ffffff',
}
export const validColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
export const validFontPack = (value: unknown): value is FontPackId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(fontPacks, value)

export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  }
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

export function resolveSiteStyles(config: SiteStyleConfig = {}) {
  const fontPackId = validFontPack(config.fontPackId) ? config.fontPackId : DEFAULT_FONT_PACK
  const colors = { ...DEFAULT_COLORS }
  for (const key of Object.keys(colors) as (keyof typeof colors)[]) {
    if (validColor(config[key])) colors[key] = config[key]
  }
  // Preserve legacy defaults; correct only a pair customized by the embed.
  const customAccentPair = validColor(config.accent) || validColor(config.onAccent)
  if (customAccentPair && contrastRatio(colors.accent, colors.onAccent) < 4.5) {
    colors.onAccent = contrastRatio(colors.accent, '#ffffff') >= contrastRatio(colors.accent, '#18181b')
      ? '#ffffff' : '#18181b'
  }
  const font = config.font === 'off' ? 'off' : 'on'
  const theme: ThemePref = config.theme === 'dark' || config.theme === 'auto' ? config.theme : 'light'
  return { fontPackId, font, theme, colors, tokens: {
    '--vz-accent': colors.accent,
    '--vz-accent-tint': colors.accentLight,
    '--vz-accent-strong': colors.accentDark,
    '--vz-on-accent': colors.onAccent,
    '--vz-font': font === 'off' ? SYSTEM_FONT : `'${fontPacks[fontPackId]}', ${SYSTEM_FONT}`,
  } }
}

// Both entry points pass through resolveSiteStyles before any DOM/CSS mutation.
export function siteStylesFromDataset(ds: Record<string, string | undefined>): SiteStyleConfig {
  return {
    fontPackId: ds.vizytoFontPackId,
    font: ds.vizytoFont === 'off' ? 'off' : 'on',
    theme: ds.vizytoTheme as ThemePref,
    accent: ds.vizytoAccent, accentLight: ds.vizytoAccentLight,
    accentDark: ds.vizytoAccentDark, onAccent: ds.vizytoOnAccent,
  }
}

export type FontManifest = {
  schemaVersion: number
  hash: string
  fontPacks: Record<string, { family: string; files: {
    path: string; weight: number; unicodeRange: string
  }[] }>
}

// The manifest is trusted build output, never embed input or a remote stylesheet.
export function fontFaceCss(
  styles: ReturnType<typeof resolveSiteStyles>, manifest: FontManifest, origin = widgetOrigin,
): string {
  if (styles.font === 'off') return ''
  const fontOrigin = resolveWidgetOrigin(origin)
  const pack = manifest.fontPacks[styles.fontPackId]
  return pack.files.map((file) => `@font-face {
  font-family: '${pack.family}';
  font-style: normal;
  font-weight: ${file.weight};
  font-display: swap;
  src: url('${fontOrigin}${file.path}') format('woff2');
  unicode-range: ${file.unicodeRange};
}`).join('\n')
}

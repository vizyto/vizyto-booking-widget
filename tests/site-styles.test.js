import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { collectFontAssets, sha256 } from '../scripts/font-assets.mjs'
import { css } from '../src/styles.ts'
import {
  DEFAULT_COLORS, DEFAULT_FONT_PACK, SYSTEM_FONT, contrastRatio, fontFaceCss,
  fontPacks, resolveSiteStyles, siteStylesFromDataset, validColor, validFontPack,
} from '../src/site-styles.ts'

const { manifest, assets } = collectFontAssets()
const expectedPacks = {
  'fraunces-manrope-v1': 'Manrope', 'bodoni-moda-outfit-v1': 'Outfit',
  'cormorant-garamond-jost-v1': 'Jost', 'oswald-poppins-v1': 'Poppins',
  'anton-ibm-plex-sans-v1': 'IBM Plex Sans', 'barlow-condensed-barlow-v1': 'Barlow',
  'archivo-black-archivo-space-mono-v1': 'Archivo', 'montserrat-roboto-v1': 'Roboto',
  'archivo-inter-v1': 'Inter',
}
const fromData = (ds) => resolveSiteStyles(siteStylesFromDataset(ds))
const covers = (range, char) => range.split(',').some((part) => {
  const [start, end = start] = part.trim().replace('U+', '').split('-').map((n) => parseInt(n, 16))
  return char.codePointAt(0) >= start && char.codePointAt(0) <= end
})

describe('backward-compatible style inputs', () => {
  test('old snippet keeps every legacy token and the light default', () => {
    const styles = fromData({ vizytoBusiness: '24', vizytoKey: 'pk_test' })
    expect(styles.fontPackId).toBe(DEFAULT_FONT_PACK)
    expect(styles.tokens['--vz-font']).toBe(`'Poppins', ${SYSTEM_FONT}`)
    expect(styles.colors).toEqual(DEFAULT_COLORS)
    expect(styles.tokens).toEqual({
      '--vz-accent': '#fd9320',
      '--vz-accent-tint': '#ffdca8',
      '--vz-accent-strong': '#bf700f',
      '--vz-on-accent': '#ffffff',
      '--vz-font': `'Poppins', ${SYSTEM_FONT}`,
    })
    expect(styles.theme).toBe('light')
    expect(resolveSiteStyles()).toEqual(styles)
    for (const [token, value] of Object.entries(styles.tokens)) {
      expect(css).toContain(`${token}: ${value};`)
    }
  })
  test('font off overrides a valid pack and produces no font registration', () => {
    for (const fontPackId of Object.keys(expectedPacks)) {
      const styles = fromData({ vizytoFont: 'off', vizytoFontPackId: fontPackId })
      expect(styles).toEqual(resolveSiteStyles({ font: 'off', fontPackId }))
      expect(styles.tokens['--vz-font']).toBe(SYSTEM_FONT)
      expect(fontFaceCss(styles, manifest)).toBe('')
    }
  })
  test('light, dark and legacy auto work through both entry points', () => {
    for (const theme of ['light', 'dark', 'auto']) {
      expect(fromData({ vizytoTheme: theme })).toEqual(resolveSiteStyles({ theme }))
      expect(fromData({ vizytoTheme: theme }).theme).toBe(theme)
    }
    expect(fromData({ vizytoTheme: 'dark;}' }).theme).toBe('light')
  })
  test('allowlist matches all nine F1 IDs and their sans role', () => {
    expect(fontPacks).toEqual(expectedPacks)
    for (const [fontPackId, family] of Object.entries(expectedPacks)) {
      expect(validFontPack(fontPackId)).toBe(true)
      const styles = fromData({ vizytoFontPackId: fontPackId })
      expect(styles).toEqual(resolveSiteStyles({ fontPackId }))
      expect(styles.tokens['--vz-font']).toBe(`'${family}', ${SYSTEM_FONT}`)
      const faces = fontFaceCss(styles, manifest)
      expect(faces.match(/@font-face/g)).toHaveLength(8)
      expect(faces.match(/font-display: swap/g)).toHaveLength(8)
      expect(faces).toContain(`font-family: '${family}'`)
      expect(faces).toContain('https://widget.vizyto.com/fonts/')
      expect(faces).not.toMatch(/googleapis|gstatic|\.woff[')]/)
    }
    for (const fontPackId of ['unknown', '__proto__', 'constructor', "Poppins';} body{", '', null, 42]) {
      expect(validFontPack(fontPackId)).toBe(false)
      expect(resolveSiteStyles({ fontPackId }).fontPackId).toBe(DEFAULT_FONT_PACK)
    }
  })
})

describe('semantic colors', () => {
  test('data attributes and mount map to existing Shadow DOM tokens', () => {
    const config = { accent: '#C24A3A', accentLight: '#DD7361', accentDark: '#96382B', onAccent: '#FFFFFF' }
    const styles = resolveSiteStyles(config)
    expect(fromData({ vizytoAccent: config.accent, vizytoAccentLight: config.accentLight,
      vizytoAccentDark: config.accentDark, vizytoOnAccent: config.onAccent })).toEqual(styles)
    expect(styles.tokens).toMatchObject({ '--vz-accent': config.accent, '--vz-accent-tint': config.accentLight,
      '--vz-accent-strong': config.accentDark, '--vz-on-accent': config.onAccent })
    for (const token of Object.keys(styles.tokens)) expect(css).toContain(token)
  })
  test('rejects CSS, URLs, short hex and non-string values in every color field', () => {
    for (const bad of ['red;}', 'url(https://example.test/font)', '#fff', 'expression(', '#123456;',
      '#123456\n', ' #123456', '#12345678', 'red', null, 42, {}]) {
      expect(validColor(bad)).toBe(false)
      for (const key of Object.keys(DEFAULT_COLORS)) {
        expect(resolveSiteStyles({ [key]: bad }).colors).toEqual(DEFAULT_COLORS)
      }
    }
    expect(validColor('#aBcD09')).toBe(true)
  })
  test('contrast uses unrounded 4.5 threshold and preserves the supplied accent', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21)
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5)
    const failed = resolveSiteStyles({ accent: '#777777', onAccent: '#ffffff', accentLight: '#aabbcc' })
    expect(failed.colors).toEqual({ ...DEFAULT_COLORS, accent: '#777777', onAccent: '#ffffff', accentLight: '#aabbcc' })
    expect(resolveSiteStyles({ accent: '#767676', onAccent: '#ffffff' }).colors)
      .toEqual({ ...DEFAULT_COLORS, accent: '#767676' })
  })
  test('failing custom pairs choose the higher-contrast label through both entry points', () => {
    for (const [accent, onAccent, expected] of [
      ['#eeeeee', '#ffffff', '#18181b'],
      ['#123456', '#18181b', '#ffffff'],
    ]) {
      const styles = resolveSiteStyles({ accent, onAccent })
      expect(fromData({ vizytoAccent: accent, vizytoOnAccent: onAccent })).toEqual(styles)
      expect(styles.colors).toEqual({ ...DEFAULT_COLORS, accent, onAccent: expected })
      const alternative = expected === '#ffffff' ? '#18181b' : '#ffffff'
      expect(contrastRatio(accent, expected)).toBeGreaterThan(contrastRatio(accent, alternative))
    }
  })
  test('checks partial accent overrides but leaves independent tint overrides alone', () => {
    expect(resolveSiteStyles({ accent: '#eeeeee' }).colors)
      .toEqual({ ...DEFAULT_COLORS, accent: '#eeeeee', onAccent: '#18181b' })
    expect(resolveSiteStyles({ onAccent: '#ffffff' }).colors)
      .toEqual({ ...DEFAULT_COLORS, onAccent: '#18181b' })
    expect(resolveSiteStyles({ accent: '#000000' }).colors)
      .toEqual({ ...DEFAULT_COLORS, accent: '#000000' })
    expect(resolveSiteStyles({ accentLight: '#aabbcc', accentDark: '#112233' }).colors)
      .toEqual({ ...DEFAULT_COLORS, accentLight: '#aabbcc', accentDark: '#112233' })
  })
})

describe('self-hosted release artifacts (run pnpm build:cdn first)', () => {
  test('all font bytes, subsets, weights, hashes, license and Polish ranges', () => {
    expect(Object.keys(manifest.fontPacks)).toEqual(Object.keys(expectedPacks))
    const { hash, ...content } = manifest
    expect(hash).toBe(sha256(JSON.stringify(content)))
    const usedWeights = [...new Set([...css.matchAll(/font-weight:\s*(\d+)/g)].map((m) => Number(m[1])))].sort()
    expect(usedWeights).toEqual([400, 500, 600, 650, 700])
    expect(assets.filter((a) => a.path.endsWith('.woff2'))).toHaveLength(72)
    for (const pack of Object.values(manifest.fontPacks)) {
      expect(pack.weights).toEqual([400, 500, 600, 700])
      expect(pack.license).toBe('OFL-1.1')
      expect(readFileSync(`deploy${pack.licensePath}`, 'utf8')).toContain('SIL OPEN FONT LICENSE')
      expect(pack.files).toHaveLength(8)
      for (const file of pack.files) {
        const bytes = readFileSync(`deploy${file.path}`)
        expect(bytes.subarray(0, 4).toString()).toBe('wOF2')
        expect(sha256(bytes)).toBe(file.hash)
        expect(file.path).toContain(file.hash)
        expect(['latin', 'latin-ext']).toContain(file.subset)
        if (file.subset === 'latin-ext') {
          for (const char of 'ĄąĆćĘęŁłŃńŚśŹźŻż') expect(covers(file.unicodeRange, char)).toBe(true)
        } else {
          for (const char of 'Óó') expect(covers(file.unicodeRange, char)).toBe(true)
        }
      }
    }
  })
  test('immutable bundle and versioned manifest agree with rolling build and capabilities', () => {
    const bytes = readFileSync('dist/widget.js')
    const hash = sha256(bytes)
    const path = `deploy/v/${hash}`
    const release = JSON.parse(readFileSync(`${path}/manifest.json`, 'utf8'))
    expect(readFileSync('deploy/v1/widget.js')).toEqual(bytes)
    expect(readFileSync(`${path}/widget.js`)).toEqual(bytes)
    expect(release.widget).toMatchObject({ path: `/v/${hash}/widget.js`, hash })
    expect(release.hash).toBe(manifest.hash)
    expect(release.fontPacks).toEqual(manifest.fontPacks)
    expect(release.capabilities).toContain('fontPackId')
    expect(release.capabilities).toContain('onAccent')
    expect(readdirSync(path).sort()).toEqual(['manifest.json', 'widget.js'])
    expect(bytes.toString()).toContain(manifest.hash)
    expect(bytes.toString()).not.toMatch(/googleapis|fonts\.gstatic/)
  })
  test('rolling cache stays unchanged; immutable assets get long cache and CORS', () => {
    const headers = readFileSync('deploy/_headers', 'utf8')
    expect(headers).toContain('/v1/widget.js\n  Access-Control-Allow-Origin: *\n  Cross-Origin-Resource-Policy: cross-origin\n  Cache-Control: public, max-age=600, stale-while-revalidate=86400\n')
    for (const route of ['/fonts/*', '/v/*']) {
      expect(headers).toContain(`${route}\n  Access-Control-Allow-Origin: *\n  Cross-Origin-Resource-Policy: cross-origin\n  Cache-Control: public, max-age=31536000, immutable`)
    }
  })
})

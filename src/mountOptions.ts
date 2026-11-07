/**
 * Mount options of vizyto.com's own guest page (/r/<id>-<slug>?z=<place>), read
 * defensively because the page passes them through from a URL. External sites
 * never set them (they are not `data-*` attributes). The channel option lives in
 * ./channel next to the policy it selects.
 */

/** Where the visitor came from (the `?z=` place code of the short booking link). */
export const ENTRY_POINTS = ['instagram', 'facebook', 'whatsapp', 'google', 'qr', 'www', 'link'] as const
export type EntryPoint = (typeof ENTRY_POINTS)[number]

/** A known place code, or undefined - an unknown one is dropped, never sent. */
export function resolveEntryPoint(value: unknown): EntryPoint | undefined {
  return typeof value === 'string' && (ENTRY_POINTS as readonly string[]).includes(value) ? (value as EntryPoint) : undefined
}

/** An absolute http(s) URL, or undefined (a relative path, `javascript:` and the like are dropped). */
export function resolveLoginHref(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}

/**
 * What the login step offers instead of a password:
 *  - `buttons`: the OAuth popups (Google/Apple/Facebook) - they need a site key,
 *  - `link`: no key, but the host page has its own sign-in (`loginHref`),
 *  - `none`: no key and nowhere to send the visitor - e-mail login only.
 */
export type SocialLogin = { kind: 'buttons' } | { kind: 'link'; href: string } | { kind: 'none' }

export function socialLogin(siteKey: string | undefined, loginHref: string | undefined): SocialLogin {
  if (siteKey) return { kind: 'buttons' }
  const href = resolveLoginHref(loginHref)
  return href ? { kind: 'link', href } : { kind: 'none' }
}

import { useState } from 'preact/hooks'
import type { JSX } from 'preact'

// Uploads come from the API as absolute cdn.vizyto.com URLs of the stored
// original (up to 2000px). The zone runs Cloudflare Image Transformations, so the
// widget asks for a variant sized to the box instead - on the host's page every
// byte counts. Other hosts (Google/Facebook avatars, staging buckets, the mock's
// data URIs) have no /cdn-cgi/ and are left untouched.
const CDN_ORIGIN = 'https://cdn.vizyto.com'

export function cdnImage(url: string, width: number, square = true): string {
  if (!url.startsWith(`${CDN_ORIGIN}/`) || url.includes('/cdn-cgi/') || url.endsWith('.svg')) return url
  const opts = square
    ? `width=${width},height=${width},fit=cover,format=auto`
    : `width=${width},format=auto`
  return `${CDN_ORIGIN}/cdn-cgi/image/${opts}${url.slice(CDN_ORIGIN.length)}`
}

type Props = Omit<JSX.IntrinsicElements['img'], 'src' | 'width'> & {
  src: string
  /** Pixel width requested from the CDN - about 2x the CSS box. */
  width: number
  /** Crop to a width x width square (avatars, thumbnails). */
  square?: boolean
}

/** <img> through the CDN transform; falls back to the original when the variant fails. */
export function CdnImg({ src, width, square = true, onError, ...rest }: Props) {
  const [raw, setRaw] = useState(false)
  const url = raw ? src : cdnImage(src, width, square)
  return (
    <img
      {...rest}
      src={url}
      onError={(e) => {
        if (url !== src) setRaw(true)
        else onError?.(e)
      }}
    />
  )
}

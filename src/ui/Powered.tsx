import { VizytoLogo } from './icons'

const BLOG_URL = 'https://vizyto.com/blog/widget-rezerwacji-na-strone-internetowa'

// "powered by" credit: small caption + linked Vizyto logo, in the panel footer.
export function Powered() {
  return (
    <div class="vz-powered">
      <a class="vz-powered-link" href={BLOG_URL} target="_blank" rel="noopener noreferrer" aria-label="powered by Vizyto">
        <span class="vz-powered-cap">powered by</span>
        <VizytoLogo height={13} />
      </a>
    </div>
  )
}

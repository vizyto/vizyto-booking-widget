// Inline SVG icons (stroke = currentColor) so they inherit theme + accent and
// add nothing to the network. Kept minimal to keep the bundle small.
import type { JSX } from 'preact'

type P = { size?: number } & JSX.SVGAttributes<SVGSVGElement>

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
})

export const ChevronRight = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m9 18 6-6-6-6" /></svg>
)
export const ChevronLeft = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m15 18-6-6 6-6" /></svg>
)
export const ArrowRight = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
)
export const Sunrise = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 2v6M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1" /><path d="M8 18a4 4 0 0 1 8 0" /></svg>
)
export const Sun = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
)
export const Moon = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
)
export const ArrowLeft = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
)
export const Check = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M20 6 9 17l-5-5" /></svg>
)
export const Close = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
)
export const Clock = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
)
export const Calendar = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
)
export const Grid = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
)
export const Shield = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
)

// Brand glyphs (own fills, not stroke-based).
export const GoogleG = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
  </svg>
)
export const AppleLogo = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.37 12.6c.02 2.5 2.2 3.33 2.22 3.34-.02.06-.35 1.2-1.15 2.37-.69 1.02-1.41 2.03-2.55 2.05-1.12.02-1.48-.66-2.76-.66-1.28 0-1.68.64-2.74.68-1.1.04-1.94-1.1-2.64-2.11-1.43-2.07-2.52-5.85-1.05-8.4A4.1 4.1 0 0 1 9.18 9.8c1.08-.02 2.1.73 2.76.73.66 0 1.9-.9 3.2-.77.55.02 2.08.22 3.07 1.67-.08.05-1.83 1.07-1.84 3.17ZM14.3 8.04c.58-.7.97-1.68.86-2.65-.84.03-1.85.56-2.45 1.26-.54.62-1.01 1.61-.88 2.56.93.07 1.89-.47 2.47-1.17Z" />
  </svg>
)
export const FacebookF = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true">
    <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z" />
  </svg>
)

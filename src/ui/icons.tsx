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

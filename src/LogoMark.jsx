import { useId } from 'react'

// The WatchDog mark: a chrome shield with a dark face, focus corners and a blue eye.
// public/favicon.svg is the same mark for the browser tab; keep the two in step.
const OUTER = 'M100 12 L174 42 L170 108 Q162 150 100 190 Q38 150 30 108 L26 42 Z'
const INNER = 'M100 29 L158 53 L155 106 Q148 140 100 172 Q52 140 45 106 L42 53 Z'

export function LogoMark({ size = 36 }) {
  // Each copy needs its own gradient ids: a copy inside a hidden page (the Demo stays mounted
  // while hidden) would otherwise own the shared ids and every other copy would render blank.
  const u = useId().replace(/:/g, '')
  const id = (name) => `wd-${name}-${u}`
  const url = (name) => `url(#${id(name)})`
  return (
    <svg className="lp-mark" width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <linearGradient id={id('chrome')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.18" stopColor="#DCE3EC" />
          <stop offset="0.38" stopColor="#7C8797" />
          <stop offset="0.52" stopColor="#EEF2F7" />
          <stop offset="0.7" stopColor="#9AA5B4" />
          <stop offset="0.88" stopColor="#4A5361" />
          <stop offset="1" stopColor="#C9D1DC" />
        </linearGradient>
        <linearGradient id={id('chromeV')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.45" stopColor="#C3CCD8" />
          <stop offset="0.55" stopColor="#7E8998" />
          <stop offset="1" stopColor="#E4E9F0" />
        </linearGradient>
        <radialGradient id={id('face')} cx="0.5" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#1B2638" />
          <stop offset="0.6" stopColor="#0A111C" />
          <stop offset="1" stopColor="#03060B" />
        </radialGradient>
        <linearGradient id={id('gloss')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.16" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id('iris')} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#B9ECFF" />
          <stop offset="0.45" stopColor="#63C5E8" />
          <stop offset="1" stopColor="#2F5FD0" />
        </radialGradient>
        <radialGradient id={id('glow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#63C5E8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#4D8DFF" stopOpacity="0" />
        </radialGradient>
        <filter id={id('shadow')} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000" floodOpacity="0.6" />
        </filter>
        <filter id={id('soft')}>
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>

      {/* chrome rim, dark glossy face */}
      <g filter={url('shadow')}>
        <path d={OUTER} fill={url('chrome')} />
        <path d={OUTER} fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="1.2" />
        <path d={INNER} fill="#2A323E" />
        <path d={INNER} fill={url('face')} transform="translate(100 100) scale(.985) translate(-100 -100)" />
        <path d={INNER} fill="none" stroke="#000" strokeOpacity="0.7" strokeWidth="2" />
        <path d="M100 31 L156 54 L154 84 Q100 70 46 84 L44 54 Z" fill={url('gloss')} />
      </g>

      {/* focus corners, kept clear of the rim */}
      <path
        d="M68 85V72h13M119 72h13v13M132 117v13h-13M81 130H68v-13"
        fill="none"
        stroke={url('chromeV')}
        strokeWidth="5"
        strokeLinecap="square"
      />

      {/* blue eye under a chrome brow */}
      <circle cx="100" cy="104" r="20" fill={url('glow')} filter={url('soft')} />
      <circle cx="100" cy="106" r="15.5" fill={url('iris')} />
      <circle cx="100" cy="106" r="15.5" fill="none" stroke="#0A0F18" strokeOpacity="0.5" strokeWidth="1.5" />
      <circle cx="100" cy="106" r="7.2" fill="#05080D" />
      <circle cx="96" cy="101.5" r="2.6" fill="#FFFFFF" opacity="0.95" />
      <path d="M58 102 Q100 64 142 102 Q100 80 58 102 Z" fill={url('chromeV')} />
      <path d="M58 102 Q100 64 142 102" fill="none" stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="1" />
    </svg>
  )
}

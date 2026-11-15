import { useId } from 'react'

// The WatchDog mark: a silver shield with an eye at its center and four focus corners.
export function LogoMark({ size = 36 }) {
  // Each copy needs its own gradient id: a copy inside a hidden page (the Demo stays mounted
  // while hidden) would otherwise own the shared id and every other copy would render blank.
  const id = `lp-silver-${useId().replace(/:/g, '')}`
  return (
    <svg className="lp-mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F5F7FA" />
          <stop offset="0.5" stopColor="#C7D0DC" />
          <stop offset="1" stopColor="#8D98A8" />
        </linearGradient>
      </defs>
      <g fill="none" stroke={`url(#${id})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 11V6h5M38 6h5v5M43 37v5h-5M10 42H5v-5" opacity="0.7" />
        <path d="M24 8.5 12.5 12.8v8.6c0 7 4.9 12.9 11.5 14.6 6.6-1.7 11.5-7.6 11.5-14.6v-8.6L24 8.5Z" />
        <path d="M17.5 21.5s2.6-4.3 6.5-4.3 6.5 4.3 6.5 4.3-2.6 4.3-6.5 4.3-6.5-4.3-6.5-4.3Z" />
      </g>
      <circle cx="24" cy="21.5" r="1.8" fill={`url(#${id})`} />
    </svg>
  )
}

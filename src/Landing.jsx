import { useEffect, useRef, useState } from 'react'
import {
  MotionConfig,
  animate,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'framer-motion'
import './landing.css'
import { LogoMark } from './LogoMark.jsx'

// The public front page: what WatchDog is, how it works, what it has shown in testing, and
// a way into the real app. Everything behind the buttons (Cameras, Demo, Alerts) stays behind
// the sign-in. Product images are real screenshots of the app; the attack footage isn't shown
// here, because this page is public and has no content warning in front of it.
// The school and security-office photos are AI-generated.

const DEMO = '#/demo'
const APP = '#/demo'
const GITHUB = 'https://github.com/nateramos/WatchDog'

// Fade and rise into place once, the first time a block scrolls into view.
const rise = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
}
const delayed = (i) => ({ ...rise, transition: { ...rise.transition, delay: 0.08 * i } })

// A section heading that brightens from grey to white as it scrolls up into view.
function FadeHeading({ className, children, ...motionProps }) {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 95%', 'start 55%'] })
  const color = useTransform(scrollYProgress, [0, 1], ['#56606f', '#f5f7fa'])
  return (
    <motion.h2 ref={ref} className={className} style={reduce ? undefined : { color }} {...motionProps}>
      {children}
    </motion.h2>
  )
}

// A huge, faint outlined word behind a section that drifts sideways as the page scrolls.
function BigWord({ children }) {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const x = useTransform(scrollYProgress, [0, 1], ['6%', '-6%'])
  return (
    <div className="lp-bigword" ref={ref} aria-hidden="true">
      <motion.span style={{ x }}>{children}</motion.span>
    </div>
  )
}

// Counts a stat up from zero the first time it scrolls into view ("99.8%", "8 of 8", "0.874").
function CountUp({ value }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const reduce = useReducedMotion()
  const commas = /^\d{1,3}(,\d{3})+/.test(value)
  const [, digits, rest] = value.replace(/,/g, '').match(/^([\d.]+)(.*)$/) || [null, '0', value]
  const target = parseFloat(digits)
  const decimals = (digits.split('.')[1] || '').length
  const show = (n) => (commas ? Math.round(n).toLocaleString('en-US') : n.toFixed(decimals))
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!inView || reduce) return
    const run = animate(0, target, { duration: 1.6, ease: [0.22, 1, 0.36, 1], onUpdate: setShown })
    return () => run.stop()
  }, [inView, reduce, target])
  const text = show(reduce ? target : shown)
  return (
    <span className="lp-stat-value" ref={ref}>
      <span className="lp-sr">{value}</span>
      <span aria-hidden="true">
        {text}
        {rest}
      </span>
    </span>
  )
}

// How WatchDog moves footage: every frame goes from the cameras to WatchDog, and only a possible
// gun travels on to a person, who confirms or dismisses it. Pure CSS animation (landing.css).
function Pipeline() {
  return (
    <motion.figure className="lp-pipe" {...delayed(2)} aria-label="Camera frames go to WatchDog; only a possible gun goes on to a reviewer, who confirms or dismisses it.">
      <div className="lp-pipe-node">
        <span className="lp-pipe-icon">
          <StepIcon kind="cam" />
        </span>
        <h3>School cameras</h3>
        <p>Existing feeds</p>
      </div>
      <div className="lp-pipe-link" aria-hidden="true">
        <span className="lp-pipe-tag">Every frame</span>
        <i className="lp-packet" />
        <i className="lp-packet" />
        <i className="lp-packet" />
      </div>
      <div className="lp-pipe-node lp-pipe-core">
        <span className="lp-pipe-icon lp-pipe-logo">
          <LogoMark size={44} />
        </span>
        <h3>WatchDog</h3>
        <p>Checks four frames a second</p>
      </div>
      <div className="lp-pipe-link lp-pipe-link-alert" aria-hidden="true">
        <span className="lp-pipe-tag">Possible gun only</span>
        <i className="lp-packet lp-packet-alert" />
      </div>
      <div className="lp-pipe-node lp-pipe-person">
        <span className="lp-pipe-icon">
          <StepIcon kind="eye" />
        </span>
        <h3>Reviewer</h3>
        <p>Confirms or dismisses</p>
        <div className="lp-pipe-decision" aria-hidden="true">
          <span className="lp-pipe-chip">Possible gun · Review</span>
          <span className="lp-pipe-buttons">
            <b>Confirm</b>
            <b>Dismiss</b>
          </span>
        </div>
      </div>
    </motion.figure>
  )
}

// A wall of ordinary campus cameras being checked: a scan beam sweeps across, each camera is
// marked clear as it passes, and the frame counter climbs while "possible guns" stays at zero.
// The footage is the same ordinary CCTV as the one-hour false-alarm test.
const WALL_COLS = 3
const WALL_ROWS = 4
const SWEEP_MS = 3200
const HOLD_MS = 1400

function ScanWall() {
  const ref = useRef(null)
  const inView = useInView(ref, { margin: '-40px' })
  const reduce = useReducedMotion()
  const [beam, setBeam] = useState(reduce ? 1.2 : 0)
  const [frames, setFrames] = useState(0)
  useEffect(() => {
    if (!inView || reduce) return
    const start = performance.now()
    let raf
    const tick = (now) => {
      const t = (now - start) % (SWEEP_MS + HOLD_MS)
      setBeam(t < SWEEP_MS ? t / SWEEP_MS : 1.2)
      // 12 cameras checked about four times a second each
      setFrames(Math.floor(((now - start) / 1000) * WALL_COLS * WALL_ROWS * 4))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, reduce])
  const cells = []
  for (let r = 0; r < WALL_ROWS; r += 1) {
    for (let c = 0; c < WALL_COLS; c += 1) {
      const clear = beam > (c + 0.5) / WALL_COLS
      cells.push(<span key={`${r}-${c}`} className={`lp-scan-cell ${clear ? 'is-clear' : ''}`}>{clear && '✓ Clear'}</span>)
    }
  }
  return (
    <motion.figure className="lp-scan" ref={ref} {...delayed(2)}>
      <div className="lp-window">
        <div className="lp-window-bar lp-scan-bar">
          <i />
          <i />
          <i />
          <span>WatchDog · checking 12 ordinary cameras</span>
          <span className="lp-scan-stats">
            <span>
              frames checked <b>{reduce ? '–' : frames.toLocaleString('en-US')}</b>
            </span>
            <span>
              possible guns <b className="lp-scan-zero">0</b>
            </span>
          </span>
        </div>
        <div className="lp-scan-view">
          <img src="/landing/footage-wall-tall.jpg" alt="Twelve ordinary campus security cameras: hallways, walkways, a cafeteria and a gym, with students walking through." />
          <div className="lp-scan-grid" aria-hidden="true">
            {cells}
          </div>
          {!reduce && beam <= 1 && <span className="lp-scan-beam" style={{ left: `${beam * 100}%` }} aria-hidden="true" />}
        </div>
      </div>
      <figcaption>
        Zero false alarms in an hour of real campus CCTV.
      </figcaption>
    </motion.figure>
  )
}

function useScrolled(offset = 24) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > offset)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [offset])
  return scrolled
}

// Section links scroll the page instead of changing the hash: the app uses the hash for its
// pages (#/demo, #/alerts), so "#how" would leave this page.
function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const LINKS = [
  ['how', 'How it works'],
  ['results', 'Results'],
  ['plans', 'Plans'],
]

function Nav({ signedIn }) {
  const scrolled = useScrolled()
  const [open, setOpen] = useState(false)
  const go = (id) => {
    setOpen(false)
    scrollToId(id)
  }
  return (
    <header className={`lp-nav ${scrolled || open ? 'lp-nav-solid' : ''}`}>
      <div className="lp-nav-inner">
        <a className="lp-brand" href="#/" onClick={(e) => (e.preventDefault(), window.scrollTo({ top: 0, behavior: 'smooth' }))}>
          <LogoMark size={38} />
          <span>WatchDog</span>
        </a>
        <nav className="lp-links" aria-label="Sections">
          {LINKS.map(([id, label]) => (
            <button key={id} onClick={() => go(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="lp-nav-cta">
          <a className="lp-signin" href={APP}>
            {signedIn ? 'Open app' : 'Sign in'}
          </a>
          <a className="lp-btn lp-btn-primary lp-btn-sm" href={DEMO}>
            <span className="lp-long">Try the demo</span>
            <span className="lp-short">Try demo</span>
          </a>
          <button
            className={`lp-burger ${open ? 'lp-burger-open' : ''}`}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>
      <motion.nav
        className="lp-mobile"
        aria-label="Sections"
        initial={false}
        animate={open ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        {LINKS.map(([id, label]) => (
          <button key={id} onClick={() => go(id)} tabIndex={open ? 0 : -1}>
            {label}
          </button>
        ))}
        <a href={APP} tabIndex={open ? 0 : -1}>
          {signedIn ? 'Open app' : 'Sign in'}
        </a>
      </motion.nav>
    </header>
  )
}

function Hero() {
  return (
    <section className="lp-hero lp-hero-product">
      <div className="lp-hero-bg" aria-hidden="true" />
      <div className="lp-wrap lp-hero-grid">
        <div className="lp-hero-copy">
          <motion.p className="lp-eyebrow" {...delayed(0)}>
            Gun detection for school cameras
          </motion.p>
          <motion.h1 {...delayed(1)}>
            Dozens of screens.
            <br />
            One gun.
            <br />
            <span className="lp-accent">Seen in seconds.</span>
          </motion.h1>
          <motion.p className="lp-lead" {...delayed(2)}>
            WatchDog watches the cameras your school already has. The moment it sees what looks like
            a gun, it puts that camera in front of a person, and they decide what happens next.
          </motion.p>
          <motion.div className="lp-actions" {...delayed(3)}>
            <a className="lp-btn lp-btn-primary" href={DEMO}>
              Try the demo
            </a>
            <button className="lp-btn lp-btn-ghost" onClick={() => scrollToId('how')}>
              How it works
            </button>
          </motion.div>
          <motion.p className="lp-disclosure" {...delayed(4)}>
            Student-built prototype · Busch School of Business Vibe Coding Contest · Fall 2026
          </motion.p>
        </div>
        <HeroWall />
      </div>
    </section>
  )
}

// The real camera wall from the prototype, quiet, as it looks before anything happens; the
// pulsing ring and the sliding alert card show WatchDog spotting a possible gun on Camera 1.
// This page has no content warning in front of it, so the attack footage itself isn't shown.
function HeroWall() {
  return (
    <motion.figure
      className="lp-herowall"
      initial={{ opacity: 0, y: 30, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="lp-window">
        <div className="lp-window-bar">
          <i />
          <i />
          <i />
          <span>WatchDog · 8 cameras</span>
          <span className="lp-live">Demo replay</span>
        </div>
        <div className="lp-herowall-view">
          <img src="/landing/wall-alert.jpg" alt="The WatchDog camera wall: eight school cameras, including a hallway, a cafeteria, a gym and outdoor walkways, two of them offline. An alert card points to Camera 1, West hallway." />
          <span className="lp-herowall-ring" aria-hidden="true" />
          <span className="lp-scan-beam lp-herowall-beam" aria-hidden="true" />
        </div>
      </div>
      <motion.div
        className="lp-toast"
        aria-hidden="true"
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 1.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="lp-toast-dot" />
        <div>
          <b>Possible gun · 84%</b>
          <span>Camera 1 · West hallway</span>
        </div>
        <em>Review</em>
      </motion.div>
    </motion.figure>
  )
}

const ODDS = [
  ['69%', 'ended in five minutes or less'],
  ['60%', 'were over before police arrived'],
]

function Problem() {
  return (
    <section className="lp-section lp-problem" id="problem">
      <div className="lp-wrap lp-split">
        <motion.figure className="lp-office" {...rise}>
          <img src="/landing/security-office.jpg" alt="A school security officer at a desk facing a wall of camera monitors." />
          <figcaption>One person. A dozen screens.</figcaption>
        </motion.figure>
        <div>
          <motion.p className="lp-eyebrow" {...rise}>
            Why it matters
          </motion.p>
          <FadeHeading {...delayed(1)}>Most attacks are over in five minutes.</FadeHeading>
          <motion.p className="lp-body" {...delayed(2)}>
            Schools already have the cameras. What they don&rsquo;t have is someone watching every
            one of them, every second. That gap is where the minutes go.
          </motion.p>
          <div className="lp-odds">
            {ODDS.map(([value, label], k) => (
              <motion.div key={label} className="lp-odd" {...delayed(k + 3)}>
                <CountUp value={value} />
                <p>{label}</p>
              </motion.div>
            ))}
          </div>
          <motion.p className="lp-source" {...delayed(5)}>
            Of 160 active shooter incidents in the U.S., 2000 to 2013. Source: FBI,{' '}
            <a href="https://www.fbi.gov/file-repository/reports-and-publications/as-study-quick-reference-guide-updated1.pdf">
              A Study of Active Shooter Incidents
            </a>{' '}
            (2014).
          </motion.p>
        </div>
      </div>
    </section>
  )
}

function StepIcon({ kind }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      {kind === 'cam' && <g {...p}><rect x="3" y="7" width="13" height="10" rx="2" /><path d="m16 11 5-3v8l-5-3" /></g>}
      {kind === 'scan' && <g {...p}><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3" /><rect x="8.5" y="9" width="7" height="6" rx="1" /></g>}
      {kind === 'eye' && <g {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.6" /></g>}
      {kind === 'shield' && <g {...p}><path d="M12 3 5 5.8v5.4c0 4.3 3 8.1 7 9.3 4-1.2 7-5 7-9.3V5.8L12 3Z" /><path d="m9 12 2 2 4-4" /></g>}
    </svg>
  )
}

function HowItWorks() {
  return (
    <section className="lp-section lp-how" id="how">
      <BigWord>WATCH</BigWord>
      <div className="lp-wrap">
        <motion.p className="lp-eyebrow" {...rise}>
          How it works
        </motion.p>
        <FadeHeading {...delayed(1)}>It watches. A person decides.</FadeHeading>
        <Pipeline />
      </div>
    </section>
  )
}

const RESULTS = [
  ['195,000', 'Training images, including 49,000 look-alikes'],
  ['11,694', 'Test images it never saw in training'],
  ['0.874', 'Detection score (mAP50) on those test images'],
  ['99.8%', 'Of look-alikes ignored: phones, umbrellas, remotes'],
]

function Results() {
  return (
    <section className="lp-section lp-results" id="results">
      <BigWord>PROVEN</BigWord>
      <div className="lp-wrap">
        <motion.p className="lp-eyebrow" {...rise}>
          Tested on real footage
        </motion.p>
        <FadeHeading {...delayed(1)}>Built on real data. Tested on footage it had never seen.</FadeHeading>
        <ScanWall />
        <div className="lp-stats">
          {RESULTS.map(([value, label], i) => (
            <motion.div key={label} className="lp-stat" {...delayed(i + 1)}>
              <CountUp value={value} />
              <h3>{label}</h3>
            </motion.div>
          ))}
        </div>
        <motion.p className="lp-footnote" {...rise}>
          Every test used footage the model never trained on. Full results are on{' '}
          <a href={GITHUB}>GitHub</a>.
        </motion.p>
      </div>
    </section>
  )
}

const STORIES = [
  [
    'Uvalde, Texas · 2022',
    '77',
    'minutes',
    'passed between the gunman walking into Robb Elementary and police stopping him.',
  ],
  [
    'Parkland, Florida · 2018',
    '20+',
    'minutes behind',
    'The cameras saw everything. Officers were working from footage they thought was live.',
  ],
  [
    'Washington, D.C. · January 2026',
    '2',
    'hours',
    'Shots were fired a block from The Catholic University of America. For nearly two hours the campus sheltered in place, and no one could say if the shooter was on campus.',
  ],
]

function WhyBuilt() {
  return (
    <section className="lp-section lp-why" id="why">
      <div className="lp-wrap">
        <motion.p className="lp-eyebrow" {...rise}>
          Why WatchDog was built
        </motion.p>
        <FadeHeading {...delayed(1)}>The cameras were there every time.</FadeHeading>
        <div className="lp-stories">
          {STORIES.map(([place, figure, unit, text], k) => (
            <motion.figure key={place} className="lp-story" {...delayed(k + 2)}>
              <figcaption>{place}</figcaption>
              <div className="lp-story-figure">
                <CountUp value={figure} />
                <span>{unit}</span>
              </div>
              <p>{text}</p>
            </motion.figure>
          ))}
        </div>
        <motion.p className="lp-why-close" {...delayed(5)}>
          Nobody was watching them fast enough. <b>That&rsquo;s the gap WatchDog closes.</b>
        </motion.p>
        <motion.p className="lp-source" {...delayed(6)}>
          Sources: U.S. Department of Justice, Uvalde Critical Incident Review (2024); Marjory Stoneman
          Douglas Public Safety Commission (2018); WTOP and WJLA (January 15, 2026).
        </motion.p>
      </div>
    </section>
  )
}

// Prices per camera per month for each plan; the base fee and computer are per school.
const PLANS = [
  ['day', 'School Day', 20, 'Class hours on school days'],
  ['extended', 'Extended', 25, 'Adds evenings, games and events'],
  ['always', 'Always On', 30, 'Around the clock, for colleges and districts'],
]
const BASE_FEE = 200
const COMPUTER_FEE = 2500
const CAMERAS_PER_COMPUTER = 20
// Similar systems: a two-school district's public contract, $22,500 a year for 38 cameras.
const SIMILAR_PER_CAMERA_MONTH = 22500 / 38 / 12

const money = (n) => '$' + Math.round(n).toLocaleString('en-US')

function Plans() {
  const [plan, setPlan] = useState('day')
  const [cameras, setCameras] = useState(40)
  const [founding, setFounding] = useState(false)
  const rate = PLANS.find(([id]) => id === plan)[2]
  const yearly = BASE_FEE * 12 + cameras * rate * 12
  const computers = Math.max(1, Math.ceil(cameras / CAMERAS_PER_COMPUTER))
  const setup = computers * COMPUTER_FEE
  const firstYear = founding ? yearly / 2 : yearly
  const similar = cameras * SIMILAR_PER_CAMERA_MONTH * 12
  const saving = 1 - yearly / similar
  return (
    <section className="lp-section lp-plans" id="plans">
      <div className="lp-wrap">
        <motion.p className="lp-eyebrow" {...rise}>
          Plans
        </motion.p>
        <FadeHeading {...delayed(1)}>Safety shouldn&rsquo;t depend on a school&rsquo;s budget.</FadeHeading>
        <motion.p className="lp-body lp-narrow" {...delayed(2)}>
          Pay per camera for the hours you need. Every school adds {money(BASE_FEE)} a month, and an
          on-site computer that we set up for free.
        </motion.p>
        <div className="lp-plan-grid">
          {PLANS.map(([id, name, price, note], k) => (
            <motion.button
              key={id}
              type="button"
              className={`lp-plan ${plan === id ? 'is-on' : ''}`}
              onClick={() => setPlan(id)}
              aria-pressed={plan === id}
              {...delayed(k + 2)}
            >
              <span className="lp-plan-name">{name}</span>
              <span className="lp-plan-price">
                ${price}
                <small>/camera/month</small>
              </span>
              <span className="lp-plan-note">{note}</span>
            </motion.button>
          ))}
        </div>
        <motion.div className="lp-calc" {...delayed(3)}>
          <div className="lp-calc-inputs">
            <label className="lp-calc-label" htmlFor="lp-cams">
              What would WatchDog cost your school?
              <span>
                <b>{cameras}</b> cameras
              </span>
            </label>
            <input
              id="lp-cams"
              type="range"
              min="5"
              max="200"
              step="5"
              value={cameras}
              onChange={(e) => setCameras(Number(e.target.value))}
            />
            <label className="lp-check">
              <input type="checkbox" checked={founding} onChange={(e) => setFounding(e.target.checked)} />
              Founding school: 50% off your first year
            </label>
            <p className="lp-founding-note">
              Our first five schools pay half for their first year. In return, they help shape WatchDog
              with honest feedback while it&rsquo;s new. After that year, regular pricing applies.
            </p>
          </div>
          <dl className="lp-calc-out">
            <div>
              <dt>Every year</dt>
              <dd>{money(yearly)}</dd>
            </div>
            {founding && (
              <div>
                <dt>First year (founding)</dt>
                <dd>{money(firstYear)}</dd>
              </div>
            )}
            <div>
              <dt>
                Setup, one time ({computers} computer{computers > 1 ? 's' : ''})
              </dt>
              <dd>{money(setup)}</dd>
            </div>
            <div>
              <dt>Works out to</dt>
              <dd>{money(yearly / 12 / cameras)} per camera a month</dd>
            </div>
          </dl>
        </motion.div>
        <motion.div className="lp-compare" {...delayed(3)}>
          <h3>Compared with similar systems</h3>
          <p className="lp-compare-sub">Same {cameras} cameras, every year</p>
          <div className="lp-bar">
            <span className="lp-bar-label">WatchDog</span>
            <span className="lp-bar-track">
              <motion.span
                className="lp-bar-fill lp-bar-ours"
                animate={{ width: `${Math.min(100, (yearly / Math.max(yearly, similar)) * 100)}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
            <span className="lp-bar-value">{money(yearly)}</span>
          </div>
          <div className="lp-bar">
            <span className="lp-bar-label">Similar systems</span>
            <span className="lp-bar-track">
              <motion.span
                className="lp-bar-fill lp-bar-theirs"
                animate={{ width: `${Math.min(100, (similar / Math.max(yearly, similar)) * 100)}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
            <span className="lp-bar-value">{money(similar)}</span>
          </div>
          <p className={`lp-calc-verdict ${saving > 0 ? '' : 'is-more'}`}>
            {saving > 0
              ? `WatchDog costs about ${Math.round(saving * 100)}% less.`
              : `About ${Math.round(-saving * 100)}% more at this size.`}
          </p>
        </motion.div>
        <motion.p className="lp-source" {...delayed(4)}>
          Similar systems: a public school-district contract, $22,500 a year for 38 cameras (StateScoop
          public records, 2024). Setup assumes one computer per {CAMERAS_PER_COMPUTER} cameras. Prices
          are a prototype plan, not a quote.
        </motion.p>
      </div>
    </section>
  )
}

const PROMISES = [
  ['face', 'No face recognition, ever.', 'It looks for guns, not people.'],
  ['building', 'Video never leaves the building.', 'Everything runs on a computer inside the school.'],
  ['person', 'A person decides, every time.', 'WatchDog flags. Your staff make the call.'],
]

// Simple line icons that draw themselves in when they scroll into view.
function PromiseIcon({ kind }) {
  const draw = {
    initial: { pathLength: 0 },
    whileInView: { pathLength: 1 },
    viewport: { once: true },
    transition: { duration: 1.2, ease: 'easeInOut' },
  }
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
      {kind === 'face' && (
        <g {...p}>
          <motion.path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" {...draw} />
          <motion.path d="M9 10h.01M15 10h.01M9.5 15c1.4 1 3.6 1 5 0" {...draw} />
          <motion.path d="M3 21 21 3" {...draw} />
        </g>
      )}
      {kind === 'building' && (
        <g {...p}>
          <motion.path d="M4 21V9l8-5 8 5v12M4 21h16" {...draw} />
          <motion.path d="M9.5 21v-5a2.5 2.5 0 0 1 5 0v5" {...draw} />
          <motion.path d="M10 11h4" {...draw} />
        </g>
      )}
      {kind === 'person' && (
        <g {...p}>
          <motion.path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5" {...draw} />
          <motion.path d="m15.5 11.5 2 2 4-4.5" {...draw} />
        </g>
      )}
    </svg>
  )
}

function PromiseStrip() {
  return (
    <section className="lp-section lp-promise" id="promise">
      <div className="lp-wrap lp-promise-grid">
        {PROMISES.map(([kind, title, text], k) => (
          <motion.div key={title} className="lp-promise-item" {...delayed(k)}>
            <span className="lp-promise-icon">
              <PromiseIcon kind={kind} />
            </span>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function Showcase() {
  return (
    <section className="lp-section lp-showcase" id="demo">
      <div className="lp-final-glow" aria-hidden="true" />
      <div className="lp-wrap lp-center">
        <motion.div {...rise}>
          <LogoMark size={88} />
        </motion.div>
        <FadeHeading className="lp-h2-xl" {...delayed(1)}>
          Watch it catch one.
        </FadeHeading>
        <motion.p className="lp-body lp-narrow" {...delayed(2)}>
          Eight school cameras. One of them is real footage from a school shooting. See the alert
          land, then make the call yourself.
        </motion.p>
        <motion.div className="lp-actions lp-actions-center" {...delayed(3)}>
          <a className="lp-btn lp-btn-primary lp-btn-lg" href={DEMO}>
            Try the demo
          </a>
        </motion.div>
        <motion.p className="lp-note" {...delayed(4)}>
          One click, no password. It replays recorded footage and saved results, and starts when you
          press Start.
        </motion.p>
        <motion.p className="lp-warning" {...delayed(5)}>
          Content note: Camera 1 is police-released footage of the armed attacker inside the 2023
          Covenant School shooting in Nashville.
        </motion.p>
      </div>
    </section>
  )
}

function Footer({ signedIn }) {
  return (
    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-grid">
        <div>
          <div className="lp-brand">
            <LogoMark size={32} />
            <span>WatchDog</span>
          </div>
          <p>Spots a possible gun on school cameras and gets a person looking at it, fast.</p>
        </div>
        <nav aria-label="Footer">
          <a href={DEMO}>Demo</a>
          <a href={APP}>{signedIn ? 'Open app' : 'Sign in'}</a>
          <a href={GITHUB}>GitHub</a>
        </nav>
      </div>
      <div className="lp-wrap lp-legal">
        <p>
          WatchDog is a prototype built for the Busch School of Business AI Vibe Coding Contest. It
          does not replace established school safety procedures, emergency services, or calling 911.
        </p>
        <p>© 2026 WatchDog. All rights reserved.</p>
      </div>
    </footer>
  )
}

export default function Landing({ signedIn = false }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="lp">
        <div className="lp-drift" aria-hidden="true" />
        <Nav signedIn={signedIn} />
        <main>
          <Hero />
          <Problem />
          <WhyBuilt />
          <HowItWorks />
          <Results />
          <Plans />
          <PromiseStrip />
          <Showcase />
        </main>
        <Footer signedIn={signedIn} />
      </div>
    </MotionConfig>
  )
}

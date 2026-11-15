import { useEffect, useRef, useState } from 'react'
import { MotionConfig, motion, useScroll, useTransform } from 'framer-motion'
import './landing.css'
import { LogoMark } from './LogoMark.jsx'

// The public front page: what WatchDog is, how it works, what it has shown in testing, and
// a way into the real app. Everything behind the buttons (Cameras, Demo, Alerts) stays behind
// the sign-in. Product images are real screenshots of the app; the camera showing the attacker
// is blurred here, because this page is public and has no content warning in front of it.
// The school and security-office photos are AI-generated.

const DEMO = '#/demo'
const APP = '#/cameras'
const GITHUB = 'https://github.com/nateramos/WatchDog'

// Fade and rise into place once, the first time a block scrolls into view.
const rise = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
}
const delayed = (i) => ({ ...rise, transition: { ...rise.transition, delay: 0.08 * i } })

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
  ['trust', 'Responsible AI'],
  ['about', 'About'],
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
          <LogoMark size={30} />
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
            <span className="lp-long">Experience the demo</span>
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
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '12%'])
  return (
    <section className="lp-hero" ref={ref}>
      <motion.div className="lp-hero-bg" style={{ y: bgY }} aria-hidden="true" />
      <div className="lp-hero-shade" aria-hidden="true" />
      <div className="lp-wrap">
        <div className="lp-hero-copy">
          <motion.p className="lp-eyebrow" {...delayed(0)}>
            Intelligent campus security
          </motion.p>
          <motion.h1 {...delayed(1)}>
            Your cameras see everything.
            <br />
            Now they can help you see <span className="lp-accent">what matters.</span>
          </motion.h1>
          <motion.p className="lp-lead" {...delayed(2)}>
            WatchDog adds an intelligent layer to the security cameras a school already has. It
            looks for a possible gun and brings that footage to the people who can respond, who
            decide what happens next.
          </motion.p>
          <motion.div className="lp-actions" {...delayed(3)}>
            <a className="lp-btn lp-btn-primary" href={DEMO}>
              Experience WatchDog
            </a>
            <button className="lp-btn lp-btn-ghost" onClick={() => scrollToId('meet')}>
              Explore the technology
            </button>
          </motion.div>
          <motion.p className="lp-trust" {...delayed(4)}>
            Built to support school safety teams. Designed around human judgment.
          </motion.p>
          <motion.p className="lp-disclosure" {...delayed(5)}>
            Student-built prototype · Busch School of Business Vibe Coding Contest · Fall 2026
          </motion.p>
        </div>
      </div>
    </section>
  )
}

const PROBLEMS = [
  ['01', 'Too much footage', 'Hours of video make it hard for security staff to find the moments that matter.'],
  ['02', 'Limited attention', 'No one can watch every camera, every hallway and every common area at once.'],
  ['03', 'Delayed awareness', 'When a possible threat goes unnoticed, the time to respond can shrink.'],
]

function Problem() {
  return (
    <section className="lp-section lp-problem" id="problem">
      <div className="lp-wrap lp-split">
        <motion.figure className="lp-office" {...rise}>
          <img src="/landing/security-office.jpg" alt="A school security officer at a desk facing a wall of camera monitors." />
          <figcaption>One person, a dozen screens.</figcaption>
        </motion.figure>
        <div>
          <motion.h2 {...rise}>Security cameras shouldn't just record what happened.</motion.h2>
          <motion.p className="lp-body" {...delayed(1)}>
            Schools already have cameras across their campuses. But watching many feeds at once is
            hard, and the moment that matters can hide in a sea of ordinary footage.
          </motion.p>
          <ol className="lp-problems">
            {PROBLEMS.map(([n, title, text], i) => (
              <motion.li key={n} {...delayed(i + 2)}>
                <span className="lp-num">{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
      <motion.p className="lp-transition" {...rise}>
        What if your existing cameras could do more?
      </motion.p>
      <motion.figure className="lp-wrap lp-strip" {...delayed(1)}>
        <div className="lp-window">
          <picture>
            <source media="(max-width: 720px)" srcSet="/landing/footage-wall-tall.jpg" />
            <img src="/landing/footage-wall.jpg" alt="Twelve security camera feeds of ordinary school life: a hallway, a cafeteria, a gym and outdoor walkways." />
          </picture>
        </div>
        <figcaption>Twelve real feeds from WatchDog&rsquo;s test footage. Which one needs attention?</figcaption>
      </motion.figure>
    </section>
  )
}

const FLOW = [
  ['Possible detection', 'WatchDog flags a possible gun, with a confidence score, a snapshot and a clip.'],
  ['Human review', 'A named reviewer looks at the footage. Nothing is treated as a threat yet.'],
  ['Confirmed or dismissed', 'The reviewer decides. Every decision is signed and written to a log.'],
]

const BENEFITS = [
  ['Intelligent monitoring', 'An AI model checks camera footage about four times a second for a possible gun.'],
  ['Centralized alerts', 'Every possible detection lands in one inbox, with a snapshot and a short clip.'],
  ['Human review', 'A person looks at every alert and confirms or dismisses it. WatchDog never decides on its own.'],
]

function Meet() {
  return (
    <section className="lp-section lp-meet" id="meet">
      <div className="lp-wrap">
        <motion.p className="lp-eyebrow" {...rise}>
          The product
        </motion.p>
        <motion.h2 className="lp-h2-xl" {...delayed(1)}>
          Meet WatchDog.
        </motion.h2>
        <motion.p className="lp-sub" {...delayed(2)}>
          An intelligent layer between your cameras and your security team.
        </motion.p>
        <motion.p className="lp-body lp-narrow" {...delayed(3)}>
          WatchDog checks security camera footage for a possible gun and brings anything it finds
          into one review workflow. Instead of relying on someone watching every screen, it points a
          person at the footage that may need attention.
        </motion.p>
        <motion.figure className="lp-showpiece" {...delayed(2)}>
          <div className="lp-window">
            <div className="lp-window-bar" aria-hidden="true">
              <i />
              <i />
              <i />
              <span>WatchDog · Possible gun on Camera 1</span>
            </div>
            <img src="/landing/wall-alert.jpg" alt="The WatchDog camera wall with Camera 1 outlined in red and marked Possible gun, Review. The other cameras show ordinary activity." />
          </div>
          <figcaption>
            A real alert in the prototype: Camera 1 turns red and asks for review, while every other
            camera stays quiet. Camera 1 is blurred on this page.
          </figcaption>
        </motion.figure>
        <div className="lp-benefits">
          {BENEFITS.map(([title, text], i) => (
            <motion.div key={title} className={`lp-benefit ${i === 2 ? 'lp-benefit-key' : ''}`} {...delayed(i)}>
              <h3>{title}</h3>
              <p>{text}</p>
            </motion.div>
          ))}
        </div>
        <div className="lp-split lp-review">
          <motion.figure className="lp-alert-figure" {...rise}>
            <div className="lp-window">
              <img src="/landing/alert-card.jpg" alt="A WatchDog alert card: Possible Gun, 75% confidence, Demo replay, Camera 1 West hallway, with Confirm threat and Dismiss buttons." />
            </div>
            <figcaption>A real alert card from the prototype (snapshot blurred).</figcaption>
          </motion.figure>
          <div>
            <motion.h3 className="lp-h3-lg" {...rise}>
              A possible gun is never treated as a confirmed threat.
            </motion.h3>
            <ol className="lp-flow">
              {FLOW.map(([title, text], i) => (
                <motion.li key={title} className={i === 0 ? 'lp-flow-alert' : ''} {...delayed(i + 1)}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </motion.li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}

const STEPS = [
  ['01', 'Connect', 'WatchDog is designed to sit alongside a school’s existing cameras. The prototype plays recorded clips.', 'cam'],
  ['02', 'Analyze', 'An AI model checks the video for a possible gun, and only counts one seen in two checks in a row.', 'scan'],
  ['03', 'Review', 'A trained person sees a snapshot and a short clip, then confirms or dismisses the alert.', 'eye'],
  ['04', 'Respond', 'When a threat is confirmed, school staff follow their own emergency procedures. WatchDog does not call anyone.', 'shield'],
]

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
    <section className="lp-section" id="how">
      <div className="lp-wrap">
        <motion.p className="lp-eyebrow" {...rise}>
          How it works
        </motion.p>
        <motion.h2 {...delayed(1)}>From camera footage to informed action.</motion.h2>
        <ol className="lp-steps">
          {STEPS.map(([n, title, text, icon], i) => (
            <motion.li key={n} {...delayed(i + 1)}>
              <div className="lp-step-top">
                <span className="lp-step-num">{n}</span>
                <span className="lp-step-icon">
                  <StepIcon kind={icon} />
                </span>
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  )
}

const RESULTS = [
  ['0.874', 'Gun detection score (mAP50)', 'Measured on 11,694 images the model never saw during training.'],
  ['99.8%', 'Look-alikes correctly ignored', '5,484 of 5,495 photos of phones, umbrellas, remotes and other gun-shaped objects, not flagged.'],
  ['8 of 8', 'Alerts on the real gun', 'Every clip of real school-shooting CCTV raised an alert, and every alert was on the real weapon.'],
  ['0', 'False alarms in an hour of campus CCTV', '12,670 frames of students with backpacks, bags and phones, and not one false alert.'],
]

function Results() {
  return (
    <section className="lp-section lp-results" id="results">
      <div className="lp-wrap">
        <motion.p className="lp-eyebrow" {...rise}>
          Trained and tested
        </motion.p>
        <motion.h2 {...delayed(1)}>Built on 195,000 images. Proven on footage it had never seen.</motion.h2>
        <motion.p className="lp-body lp-narrow" {...delayed(2)}>
          WatchDog&rsquo;s model, Model Dublin, learned from about 146,000 weapon images and 49,000
          look-alike photos over 50 rounds of training on a rented GPU. Every test below used images
          and footage it never trained on, with the same settings as the app.
        </motion.p>
        <div className="lp-stats">
          {RESULTS.map(([value, label, text], i) => (
            <motion.div key={label} className="lp-stat" {...delayed(i + 1)}>
              <span className="lp-stat-value">{value}</span>
              <h3>{label}</h3>
              <p>{text}</p>
            </motion.div>
          ))}
        </div>
        <motion.p className="lp-footnote" {...rise}>
          mAP50 is a score from 0 to 1 for finding the guns in an image and boxing them in the right
          spot without boxing anything else. Zero false alarms in one hour does not mean never, which
          is why a person reviews every alert. Full results and test sources are in the{' '}
          <a href={GITHUB}>GitHub README</a>.
        </motion.p>
      </div>
    </section>
  )
}

function Showcase() {
  return (
    <section className="lp-section lp-showcase" id="demo">
      <div className="lp-wrap lp-center">
        <motion.p className="lp-eyebrow" {...rise}>
          Interactive demo
        </motion.p>
        <motion.h2 {...delayed(1)}>See the system in action.</motion.h2>
        <motion.p className="lp-body lp-narrow" {...delayed(2)}>
          Explore the WatchDog prototype: a wall of eight school cameras, a possible gun on one of
          them, and the review that follows.
        </motion.p>
        <motion.div className="lp-actions lp-actions-center" {...delayed(3)}>
          <a className="lp-btn lp-btn-primary lp-btn-lg" href={DEMO}>
            Launch interactive demo
          </a>
        </motion.div>
        <motion.p className="lp-note" {...delayed(4)}>
          Uses recorded footage and saved detection results, and starts only when you press Start.
          Sign in with <strong>Try the demo</strong>: one click, no password.
        </motion.p>
        <motion.p className="lp-warning" {...delayed(5)}>
          Content note: Camera 1 shows real security footage of an armed attacker inside a school,
          released by police after the 2023 Covenant School shooting in Nashville.
        </motion.p>
      </div>
    </section>
  )
}


const PRINCIPLES = [
  ['Human oversight', 'AI detections are indicators for review, not final decisions.'],
  ['Responsible monitoring', 'Security technology should run under clear school policies and access controls.'],
  ['Transparency', 'Possible detections are labeled as possible, reviewable, and kept separate from confirmed incidents.'],
  ['Privacy by design', 'No facial recognition, and video is checked on the device. A real deployment must also cover data protection, access, retention and student privacy law.'],
]

function Trust() {
  return (
    <section className="lp-section lp-trust-section" id="trust">
      <div className="lp-wrap">
        <div className="lp-trust-head">
          <motion.div className="lp-trust-mark" {...rise}>
            <LogoMark size={88} />
          </motion.div>
          <div>
            <motion.p className="lp-eyebrow" {...rise}>
              Responsible AI
            </motion.p>
            <motion.h2 {...delayed(1)}>Technology should support people. Not replace their judgment.</motion.h2>
          </div>
        </div>
        <div className="lp-principles">
          {PRINCIPLES.map(([title, text], i) => (
            <motion.div key={title} className="lp-principle" {...delayed(i)}>
              <h3>{title}</h3>
              <p>{text}</p>
            </motion.div>
          ))}
        </div>
        <motion.p className="lp-911" {...rise}>
          WatchDog is designed to supplement a school&rsquo;s existing safety procedures. It does not
          replace emergency services, trained security staff, or calling 911.
        </motion.p>
      </div>
    </section>
  )
}

function About() {
  return (
    <section className="lp-section" id="about">
      <div className="lp-wrap lp-about">
        <motion.h2 {...rise}>Built around a simple idea.</motion.h2>
        <div>
          <motion.p className="lp-body" {...delayed(1)}>
            WatchDog is a student-built project exploring how AI can make the security cameras a
            school already has more useful, while keeping a person in charge of every decision.
          </motion.p>
          <motion.p className="lp-body" {...delayed(2)}>
            It was built for the Busch School of Business AI Vibe Coding Contest at The Catholic
            University of America, Fall 2026, to show how computer vision and a human-centered review
            workflow could work together to support campus safety.
          </motion.p>
          <motion.dl className="lp-facts" {...delayed(3)}>
            <div>
              <dt>Built by</dt>
              <dd>Nate Ramos</dd>
            </div>
            <div>
              <dt>Contest</dt>
              <dd>Busch School of Business, Fall 2026</dd>
            </div>
            <div>
              <dt>Code</dt>
              <dd>
                <a href={GITHUB}>github.com/nateramos/WatchDog</a>
              </dd>
            </div>
          </motion.dl>
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="lp-final">
      <div className="lp-final-glow" aria-hidden="true" />
      <div className="lp-wrap lp-center">
        <motion.div {...rise}>
          <LogoMark size={96} />
        </motion.div>
        <motion.h2 className="lp-h2-xl" {...delayed(1)}>
          See what your cameras could become.
        </motion.h2>
        <motion.p className="lp-body lp-narrow" {...delayed(2)}>
          Try the WatchDog prototype and explore a new approach to campus security.
        </motion.p>
        <motion.div className="lp-actions lp-actions-center" {...delayed(3)}>
          <a className="lp-btn lp-btn-primary lp-btn-lg" href={DEMO}>
            Experience the demo
          </a>
          <button className="lp-btn lp-btn-ghost lp-btn-lg" onClick={() => scrollToId('meet')}>
            Explore WatchDog
          </button>
        </motion.div>
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
            <LogoMark size={28} />
            <span>WatchDog</span>
          </div>
          <p>AI-assisted campus safety that points a person at the camera that may need attention.</p>
        </div>
        <nav aria-label="Footer">
          <a href={DEMO}>Demo</a>
          <a href={APP}>{signedIn ? 'Open app' : 'Sign in'}</a>
          <a href="#/about">About</a>
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
        <Nav signedIn={signedIn} />
        <main>
          <Hero />
          <Problem />
          <Meet />
          <HowItWorks />
          <Results />
          <Showcase />
          <Trust />
          <About />
          <FinalCta />
        </main>
        <Footer signedIn={signedIn} />
      </div>
    </MotionConfig>
  )
}

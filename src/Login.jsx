import { useState } from 'react'
import { Authenticator, ThemeProvider, defaultDarkModeOverride } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import { PrototypeNotice } from './Layout.jsx'
import { LogoMark } from './LogoMark.jsx'
import { signInAsDemo } from './auth.js'

// Amplify's sign-in form in dark colours, to match the site.
const theme = { name: 'watchdog', overrides: [defaultDarkModeOverride] }

// No "Forgot your password?" link: accounts are managed in the Cognito console.
const components = { SignIn: { Footer: () => null } }

// The app sits behind this screen (the landing page at #/ is public). Accounts are created in
// the Cognito console only (no sign-up). Judges use "Try the demo": one click, no username or
// password, mock data, below the regular sign-in.
export default function Login() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function tryDemo() {
    setBusy(true)
    setError('')
    try {
      await signInAsDemo()
    } catch {
      setError('The demo sign-in did not work. Please try again in a moment.')
      setBusy(false)
    }
  }

  return (
    <div className="shell login-page">
      <PrototypeNotice />
      <div className="login-split">
        <aside className="login-visual" aria-hidden="true">
          <div className="login-visual-brand">
            <LogoMark size={32} />
            <span>WatchDog</span>
          </div>
          <div className="login-visual-copy">
            <p className="login-visual-title">
              Your cameras see everything. Now they can help you see <span>what matters.</span>
            </p>
          </div>
        </aside>
        <main className="login">
          <a className="login-back" href="#/">
            ← Back to home
          </a>
          <div className="login-head">
            <LogoMark size={56} />
            <h1>Sign in to WatchDog</h1>
            <p>The camera wall, alerts and demo are for signed-in users.</p>
          </div>

          <ThemeProvider theme={theme} colorMode="dark">
            <Authenticator hideSignUp loginMechanisms={['email']} components={components} />
          </ThemeProvider>

          <div className="login-divider">
            <span>or</span>
          </div>

          <section className="login-demo" aria-labelledby="login-demo-title">
          <div>
            <h2 id="login-demo-title">Judging WatchDog?</h2>
            <p>Mock data, no password.</p>
          </div>
          <button className="login-demo-button" onClick={tryDemo} disabled={busy}>
            {busy ? 'Signing in…' : 'Try the demo →'}
          </button>
          {error && <p className="error small login-demo-error">{error}</p>}
        </section>
        </main>
      </div>
    </div>
  )
}

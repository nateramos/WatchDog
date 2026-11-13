import { useState } from 'react'
import { Authenticator, ThemeProvider, defaultDarkModeOverride } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import { Logo, PrototypeNotice } from './Layout.jsx'
import { signInAsDemo } from './auth.js'

// Amplify's sign-in form in dark colours, to match the site.
const theme = { name: 'watchdog', overrides: [defaultDarkModeOverride] }

// No "Forgot your password?" link: accounts are managed in the Cognito console.
const components = { SignIn: { Footer: () => null } }

// The whole site sits behind this screen. Accounts are created in the Cognito console only
// (no sign-up). Judges use "Try the demo": one click, no username or password.
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
    <div className="shell">
      <PrototypeNotice />
      <main className="login">
        <Logo />
        <h1>WatchDog</h1>

        <ThemeProvider theme={theme} colorMode="dark">
          <Authenticator hideSignUp loginMechanisms={['email']} components={components} />
        </ThemeProvider>

        <div className="login-demo">
          <p className="muted small">Testers/judges: one click, no password. Mock data only.</p>
          <button className="button" onClick={tryDemo} disabled={busy}>
            {busy ? 'Signing in…' : 'Try the demo'}
          </button>
          {error && <p className="error small">{error}</p>}
        </div>
      </main>
    </div>
  )
}

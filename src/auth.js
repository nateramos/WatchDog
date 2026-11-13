import { useEffect, useState } from 'react'
import { Amplify } from 'aws-amplify'
import { Hub } from 'aws-amplify/utils'
import { confirmSignIn, getCurrentUser, signIn, signOut } from 'aws-amplify/auth'
import { resetDemoData } from './storage.js'

// The judges' demo account (see amplify/auth/demo-sign-in). A username, not a secret.
export const DEMO_EMAIL = 'demo@watchdog-demo.example'

// Amplify writes amplify_outputs.json (the Cognito user pool IDs) during each deploy; the
// build copies it into the site. It holds no secrets. Running locally without a deployed
// backend, the file is missing and the site says so instead of showing the login.
let configured = null
function configure() {
  configured ??= fetch('/amplify_outputs.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((outputs) => {
      if (!outputs?.auth) return false
      Amplify.configure(outputs)
      return true
    })
    .catch(() => false)
  return configured
}

// 'loading' | 'unconfigured' | 'signedOut' | 'signedIn'
export function useAuthStatus() {
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    let alive = true
    const check = () =>
      getCurrentUser()
        .then(() => alive && setStatus('signedIn'))
        .catch(() => alive && setStatus('signedOut'))
    configure().then((ok) => (ok ? check() : alive && setStatus('unconfigured')))
    const stop = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn') setStatus('signedIn')
      if (payload.event === 'signedOut') setStatus('signedOut')
    })
    return () => {
      alive = false
      stop()
    }
  }, [])
  return status
}

// One click, no password: the backend lets only the demo account through this route.
// Each demo sign-in starts from an empty review log, so every judge sees the same thing.
export async function signInAsDemo() {
  resetDemoData()
  const result = await signIn({ username: DEMO_EMAIL, options: { authFlowType: 'CUSTOM_WITHOUT_SRP' } })
  if (result.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE') {
    await confirmSignIn({ challengeResponse: 'demo' })
  }
}

export { signOut }

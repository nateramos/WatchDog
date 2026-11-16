import { useEffect, useState } from 'react'
import Alerts from './Alerts.jsx'
import Cameras from './Cameras.jsx'
import Demo from './Demo.jsx'
import Landing from './Landing.jsx'
import Login from './Login.jsx'
import { useAuthStatus } from './auth.js'
import { StoreProvider } from './store.jsx'

// Hash routes (#/cameras, #/alerts, ...) so Amplify can serve every page from index.html.
function useRoute() {
  const [route, setRoute] = useState(window.location.hash)
  useEffect(() => {
    const onChange = () => {
      setRoute(window.location.hash)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

// The landing page (#/) is public. Every page of the app itself is behind the login
// (contest rule: a working login, not a placeholder).
const isLanding = (route) => route === '' || route === '#' || route === '#/'

export default function App() {
  const route = useRoute()
  const auth = useAuthStatus()
  if (isLanding(route)) return <Landing signedIn={auth === 'signedIn'} />
  if (auth === 'loading') return null
  if (auth === 'unconfigured') {
    return (
      <main className="page">
        <p className="muted">Sign-in is not set up in this copy of WatchDog. It works on the live site.</p>
      </main>
    )
  }
  if (auth === 'signedOut') {
    return (
      <div className="page-enter">
        <Login />
      </div>
    )
  }
  // Signing in fades the app in instead of cutting straight from the login screen.
  return (
    <StoreProvider>
      <div className="page-enter">
        <Page route={route} />
      </div>
    </StoreProvider>
  )
}

// Cameras and alerts live in StoreProvider, above the pages, so they survive moving
// between pages. Once opened, the Demo page stays mounted (just hidden) on other pages, so
// its camera feeds keep playing and raising alerts while the reviewer is on Alerts, the
// way live cameras would.
function Page({ route }) {
  const onDemo = route === '#/demo'
  const [demoOpened, setDemoOpened] = useState(onDemo)
  useEffect(() => {
    if (onDemo) setDemoOpened(true)
  }, [onDemo])
  return (
    <>
      {demoOpened && (
        <div hidden={!onDemo}>
          <Demo />
        </div>
      )}
      {!onDemo && <OtherPage route={route} />}
    </>
  )
}

function OtherPage({ route }) {
  if (route === '#/cameras') return <Cameras />
  if (route === '#/alerts') return <Alerts />
  return <Cameras />
}

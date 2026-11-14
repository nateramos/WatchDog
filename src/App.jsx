import { useEffect, useState } from 'react'
import About from './About.jsx'
import Demo from './Demo.jsx'
import Login from './Login.jsx'
import { Logo, SignOutButton } from './Layout.jsx'
import { useAuthStatus } from './auth.js'
import { StoreProvider } from './store.jsx'

// Hash routes (#/about, #/demo) so Amplify can serve every page from index.html.
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

function Home() {
  return (
    <main className="page">
      <div className="glow" aria-hidden="true" />

      <Logo />

      <h1>WatchDog</h1>
      <p className="description">
        AI-assisted campus safety tool that flags possible weapons in video and
        sends alerts to human responders for review.
      </p>

      <div className="actions">
        <a className="badge" href="#/about">Read More About WatchDog</a>
        <a className="badge" href="#/demo">
          <span className="dot" />
          View Demo
        </a>
      </div>
      <SignOutButton />
    </main>
  )
}

// The whole site is behind the login (contest rule: a working login, not a placeholder).
export default function App() {
  const route = useRoute()
  const auth = useAuthStatus()
  if (auth === 'loading') return null
  if (auth === 'unconfigured') {
    return (
      <main className="page">
        <p className="muted">Sign-in is not set up in this copy of WatchDog. It works on the live site.</p>
      </main>
    )
  }
  if (auth === 'signedOut') return <Login />
  return (
    <StoreProvider>
      <Page route={route} />
    </StoreProvider>
  )
}

// Cameras and alerts live in StoreProvider, above the pages, so they survive moving
// between pages.
function Page({ route }) {
  if (route === '#/about') return <About />
  if (route === '#/demo') return <Demo />
  return <Home />
}

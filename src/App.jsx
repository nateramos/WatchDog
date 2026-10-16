import { useEffect, useState } from 'react'
import About from './About.jsx'
import Demo from './Demo.jsx'
import { Logo } from './Layout.jsx'

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
    </main>
  )
}

export default function App() {
  const route = useRoute()
  if (route === '#/about') return <About />
  if (route === '#/demo') return <Demo />
  return <Home />
}

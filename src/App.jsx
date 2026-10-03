export default function App() {
  return (
    <main className="page">
      <div className="glow" aria-hidden="true" />

      <div className="logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2.5 4 5.5v6c0 4.8 3.4 8.9 8 10 4.6-1.1 8-5.2 8-10v-6l-8-3Z" />
          <path d="M7.5 12s1.7-3 4.5-3 4.5 3 4.5 3-1.7 3-4.5 3-4.5-3-4.5-3Z" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
        </svg>
      </div>

      <h1>WatchDog</h1>
      <p className="description">
        AI-assisted campus safety tool that flags possible weapons in video and
        sends alerts to human responders for review.
      </p>

      <div className="badge">
        <span className="dot" />
        Coming Soon
      </div>
    </main>
  )
}

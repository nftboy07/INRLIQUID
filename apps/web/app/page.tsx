const watchlist = [
  ['RELIANCE', 'NSE', '—', '—'],
  ['TCS', 'NSE', '—', '—'],
  ['HDFCBANK', 'NSE', '—', '—'],
  ['INFY', 'NSE', '—', '—']
];

export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">INR<span>LIQUID</span></div>
        <div className="status">REAL EXECUTION ONLY</div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">INDIAN MARKETS / INR</p>
          <h1>Trade Indian equities with a market-first interface.</h1>
          <p className="sub">UPI-native funding, live market data and real broker execution — with no paper trading layer.</p>
        </div>
        <div className="cta-card">
          <p>Execution</p>
          <strong>Provider required</strong>
          <span>Live order routing is intentionally disabled until a regulated execution provider is configured.</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Watchlist</h2><span>Live provider data</span></div>
        {watchlist.map(([symbol, exchange, price, move]) => (
          <div className="row" key={symbol}>
            <div><strong>{symbol}</strong><span>{exchange}</span></div>
            <strong>{price === '—' ? 'Awaiting feed' : `₹${price}`}</strong>
            <span>{move}</span>
          </div>
        ))}
      </section>

      <footer>INRLIQUID · integration-ready infrastructure · no simulated execution</footer>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID ?? '';
const watchlist = [['RELIANCE', 'NSE'], ['TCS', 'NSE'], ['HDFCBANK', 'NSE'], ['INFY', 'NSE'], ['ICICIBANK', 'NSE']];
const orderTypes = ['MARKET', 'LIMIT', 'STOP_MARKET', 'STOP_LIMIT', 'TAKE_MARKET', 'TAKE_LIMIT', 'SCALE', 'TWAP'];

function idempotency() { return `${crypto.randomUUID()}-${Date.now()}`; }

export default function Home() {
  const [symbol, setSymbol] = useState('RELIANCE');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState('MARKET');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [trigger, setTrigger] = useState('');
  const [wallet, setWallet] = useState<any>(null);
  const [beneficiaries, setBeneficiaries] = useState<any[]>([]);
  const [depositAmount, setDepositAmount] = useState('1000');
  const [withdrawAmount, setWithdrawAmount] = useState('100');
  const [status, setStatus] = useState('');

  const conditional = orderType.includes('STOP') || orderType.includes('TAKE');
  const needsLimit = orderType === 'LIMIT' || orderType.endsWith('LIMIT');
  const headers = DEV_USER_ID ? { 'Content-Type': 'application/json', 'x-user-id': DEV_USER_ID } : { 'Content-Type': 'application/json' };

  async function refreshWallet() {
    if (!DEV_USER_ID) return;
    const [w, b] = await Promise.all([fetch(`${API}/v1/wallet`, { headers }), fetch(`${API}/v1/wallet/beneficiaries`, { headers })]);
    if (w.ok) setWallet(await w.json());
    if (b.ok) setBeneficiaries(await b.json());
  }
  useEffect(() => { refreshWallet(); }, []);

  async function deposit() {
    if (!DEV_USER_ID) return setStatus('Configure NEXT_PUBLIC_DEV_USER_ID for local wallet testing.');
    setStatus('Creating UPI payment…');
    const r = await fetch(`${API}/v1/wallet/deposits`, { method: 'POST', headers, body: JSON.stringify({ amountInr: Number(depositAmount), idempotencyKey: idempotency() }) });
    const data = await r.json();
    if (!r.ok) return setStatus(data.message ?? data.error ?? 'Deposit failed');
    setStatus('UPI payment created. Complete payment, then the Razorpay webhook credits the wallet.');
    if (data.payment?.upiUrl) window.open(data.payment.upiUrl, '_blank', 'noopener,noreferrer');
  }

  async function withdraw() {
    if (!DEV_USER_ID) return setStatus('Configure NEXT_PUBLIC_DEV_USER_ID for local wallet testing.');
    if (!beneficiaries[0]) return setStatus('Add a verified withdrawal beneficiary through the wallet API first.');
    setStatus('Submitting withdrawal…');
    const r = await fetch(`${API}/v1/wallet/withdrawals`, { method: 'POST', headers, body: JSON.stringify({ amountInr: Number(withdrawAmount), fundAccountId: beneficiaries[0].fundAccountId, mode: beneficiaries[0].mode, idempotencyKey: idempotency() }) });
    const data = await r.json();
    setStatus(r.ok ? 'Withdrawal submitted. Final wallet state follows provider webhooks.' : (data.message ?? data.error ?? 'Withdrawal failed'));
    await refreshWallet();
  }

  return (
    <main className="terminal">
      <header className="topbar"><div className="brand">INR<span>LIQUID</span></div><nav><span>Trade</span><span>Portfolio</span><span>Orders</span><span>Payments</span></nav><div className="status">REAL EXECUTION ONLY</div></header>
      <section className="marketbar"><div><small>MARKET</small><strong>{symbol} / INR</strong><span>NSE · LIVE PROVIDER</span></div><div><small>LAST</small><strong>₹ —</strong></div><div><small>24H</small><strong>—</strong></div><div><small>BEST BID / ASK</small><strong>— / —</strong></div><div className="provider"><small>EXECUTION</small><strong>PROVIDER REQUIRED</strong></div></section>
      <section className="grid">
        <aside className="panel watchlist"><div className="panel-title"><strong>Markets</strong><span>Search</span></div><input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="Search symbol" />{watchlist.map(([s, ex]) => <button className={s === symbol ? 'market active' : 'market'} key={s} onClick={() => setSymbol(s)}><b>{s}</b><span>{ex}</span><em>—</em></button>)}</aside>
        <section className="panel book"><div className="panel-title"><strong>Order Book</strong><span>NSE</span></div><div className="book-head"><span>PRICE</span><span>SIZE</span></div>{[1,2,3,4,5].map(i => <div className="book-row ask" key={`a${i}`}><span>—</span><span>—</span></div>)}<div className="mid">₹ — <span>mid</span></div>{[1,2,3,4,5].map(i => <div className="book-row bid" key={`b${i}`}><span>—</span><span>—</span></div>)}</section>
        <section className="panel order"><div className="side-tabs"><button className={side === 'BUY' ? 'selected buy' : ''} onClick={() => setSide('BUY')}>BUY</button><button className={side === 'SELL' ? 'selected sell' : ''} onClick={() => setSide('SELL')}>SELL</button></div><label>Order type<select value={orderType} onChange={e => setOrderType(e.target.value)}>{orderTypes.map(t => <option key={t}>{t}</option>)}</select></label><label>Quantity<input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>{needsLimit && <label>Limit price (₹)<input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" /></label>}{conditional && <label>Trigger price (₹)<input inputMode="decimal" value={trigger} onChange={e => setTrigger(e.target.value)} placeholder="0.00" /></label>}<label className="check"><input type="checkbox" /> Reduce only</label><label className="check"><input type="checkbox" /> Post only / ALO</label><button className={side === 'BUY' ? 'submit buy-bg' : 'submit sell-bg'} disabled>{side} {symbol}</button><p className="disabled-note">No simulated execution. Live trading unlocks only after a regulated broker and market-data provider are configured.</p></section>
      </section>
      <section className="bottom-grid"><div className="panel"><div className="panel-title"><strong>Positions</strong><span>All markets</span></div><div className="empty">No live position data</div></div><div className="panel"><div className="panel-title"><strong>Open Orders</strong><span>Cancel all</span></div><div className="empty">No live order data</div></div>
        <div className="panel payment-hub"><div className="panel-title"><strong>Payment Hub</strong><span>UPI + Bank</span></div><div className="payment"><strong>₹ {wallet ? (Number(wallet.available_paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}</strong><span>Available balance</span><small>Locked: ₹ {wallet ? (Number(wallet.locked_paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}</small><div className="payment-actions"><input inputMode="decimal" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="Deposit ₹" /><button onClick={deposit}>ADD INR VIA UPI</button><input inputMode="decimal" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="Withdraw ₹" /><button onClick={withdraw}>WITHDRAW</button></div>{status && <p className="disabled-note">{status}</p>}{beneficiaries.length > 0 && <small>Withdrawal destination: {beneficiaries[0].maskedDestination}</small>}</div></div>
      </section>
      <footer>INRLIQUID · Hyperliquid-style terminal UX adapted to Indian cash-equity execution · provider-backed money movement only</footer>
    </main>
  );
}

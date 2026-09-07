'use client';

import { useEffect, useState } from 'react';
import PaymentHub from './payment-hub';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID ?? '';
const watchlist = [['RELIANCE', 'NSE'], ['TCS', 'NSE'], ['HDFCBANK', 'NSE'], ['INFY', 'NSE'], ['ICICIBANK', 'NSE']];
const orderTypes = ['MARKET', 'LIMIT', 'STOP_MARKET', 'STOP_LIMIT', 'TAKE_MARKET', 'TAKE_LIMIT', 'SCALE', 'TWAP'];

export default function Home() {
  const [symbol,setSymbol]=useState('RELIANCE'); const [side,setSide]=useState<'BUY'|'SELL'>('BUY'); const [orderType,setOrderType]=useState('MARKET'); const [quantity,setQuantity]=useState('1'); const [price,setPrice]=useState(''); const [trigger,setTrigger]=useState(''); const [wallet,setWallet]=useState<any>(null); const [beneficiaries,setBeneficiaries]=useState<any[]>([]);
  const conditional=orderType.includes('STOP')||orderType.includes('TAKE'); const needsLimit=orderType==='LIMIT'||orderType.endsWith('LIMIT'); const headers=DEV_USER_ID?{'Content-Type':'application/json','x-user-id':DEV_USER_ID}:{'Content-Type':'application/json'};
  async function refreshWallet(){if(!DEV_USER_ID)return;const [w,b]=await Promise.all([fetch(`${API}/v1/wallet`,{headers}),fetch(`${API}/v1/wallet/beneficiaries`,{headers})]);if(w.ok)setWallet(await w.json());if(b.ok)setBeneficiaries(await b.json());}
  useEffect(()=>{refreshWallet()},[]);
  return <main className="terminal">
    <header className="topbar"><div className="brand">INR<span>LIQUID</span></div><nav><span>Trade</span><span>Portfolio</span><span>Orders</span><span>Payments</span></nav><div className="status">REAL EXECUTION ONLY</div></header>
    <section className="marketbar"><div><small>MARKET</small><strong>{symbol} / INR</strong><span>NSE · LIVE PROVIDER</span></div><div><small>LAST</small><strong>₹ —</strong></div><div><small>24H</small><strong>—</strong></div><div><small>BEST BID / ASK</small><strong>— / —</strong></div><div className="provider"><small>EXECUTION</small><strong>PROVIDER REQUIRED</strong></div></section>
    <section className="grid">
      <aside className="panel watchlist"><div className="panel-title"><strong>Markets</strong><span>Search</span></div><input value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())} placeholder="Search symbol"/>{watchlist.map(([s,ex])=><button className={s===symbol?'market active':'market'} key={s} onClick={()=>setSymbol(s)}><b>{s}</b><span>{ex}</span><em>—</em></button>)}</aside>
      <section className="panel book"><div className="panel-title"><strong>Order Book</strong><span>NSE</span></div><div className="book-head"><span>PRICE</span><span>SIZE</span></div>{[1,2,3,4,5].map(i=><div className="book-row ask" key={`a${i}`}><span>—</span><span>—</span></div>)}<div className="mid">₹ — <span>mid</span></div>{[1,2,3,4,5].map(i=><div className="book-row bid" key={`b${i}`}><span>—</span><span>—</span></div>)}</section>
      <section className="panel order"><div className="side-tabs"><button className={side==='BUY'?'selected buy':''} onClick={()=>setSide('BUY')}>BUY</button><button className={side==='SELL'?'selected sell':''} onClick={()=>setSide('SELL')}>SELL</button></div><label>Order type<select value={orderType} onChange={e=>setOrderType(e.target.value)}>{orderTypes.map(t=><option key={t}>{t}</option>)}</select></label><label>Quantity<input type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>{needsLimit&&<label>Limit price (₹)<input inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0.00"/></label>}{conditional&&<label>Trigger price (₹)<input inputMode="decimal" value={trigger} onChange={e=>setTrigger(e.target.value)} placeholder="0.00"/></label>}<label className="check"><input type="checkbox"/> Reduce only</label><label className="check"><input type="checkbox"/> Post only / ALO</label><button className={side==='BUY'?'submit buy-bg':'submit sell-bg'} disabled>{side} {symbol}</button><p className="disabled-note">No simulated execution. Live trading unlocks only after a regulated broker and market-data provider are configured.</p></section>
    </section>
    <section className="bottom-grid"><div className="panel"><div className="panel-title"><strong>Positions</strong><span>All markets</span></div><div className="empty">No live position data</div></div><div className="panel"><div className="panel-title"><strong>Open Orders</strong><span>Cancel all</span></div><div className="empty">No live order data</div></div><PaymentHub wallet={wallet} beneficiaries={beneficiaries} refreshWallet={refreshWallet}/></section>
    <footer>INRLIQUID · Hyperliquid-style terminal UX adapted to Indian cash-equity execution · provider-backed money movement only</footer>
  </main>;
}

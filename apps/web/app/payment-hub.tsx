'use client';

import { useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
const USER = process.env.NEXT_PUBLIC_DEV_USER_ID ?? '';
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;
const headers = USER ? { 'Content-Type': 'application/json', 'x-user-id': USER } : { 'Content-Type': 'application/json' };
const key = () => `${crypto.randomUUID()}-${Date.now()}`;

type Method = 'RAZORPAY_UPI'|'STRIPE_CARD'|'STRIPE_UPI'|'STRIPE_CRYPTO';

function StripeConfirm({ clientSecret, onDone }: { clientSecret: string; onDone: (message: string) => void }) {
  const stripe = useStripe(); const elements = useElements(); const [busy,setBusy]=useState(false);
  async function confirm(){ if(!stripe||!elements)return; setBusy(true); const result=await stripe.confirmPayment({elements,confirmParams:{return_url:window.location.href},redirect:'if_required'}); setBusy(false); if(result.error)onDone(result.error.message??'Payment failed'); else onDone('Payment submitted. The server webhook will credit the wallet after provider confirmation.'); }
  return <div className="payment-checkout"><PaymentElement/><button onClick={confirm} disabled={busy||!stripe||!elements}>{busy?'CONFIRMING…':'CONFIRM PAYMENT'}</button></div>;
}

export default function PaymentHub({ wallet, beneficiaries, refreshWallet }: { wallet:any; beneficiaries:any[]; refreshWallet:()=>Promise<void> }) {
  const [amount,setAmount]=useState('1000'); const [method,setMethod]=useState<Method>('RAZORPAY_UPI'); const [asset,setAsset]=useState('USDC'); const [network,setNetwork]=useState('BASE'); const [clientSecret,setClientSecret]=useState(''); const [status,setStatus]=useState(''); const [busy,setBusy]=useState(false);
  async function start(){
    if(!USER)return setStatus('Configure NEXT_PUBLIC_DEV_USER_ID for local wallet testing.');
    setBusy(true);setStatus('Creating secure payment…');setClientSecret('');
    const body=method==='STRIPE_CRYPTO'?{amountUsd:Number(amount),asset,network,idempotencyKey:key() }:{amountInr:Number(amount),method,idempotencyKey:key(),purpose:'TRADING_FUNDING'};
    const endpoint=method==='RAZORPAY_UPI'?'/v1/wallet/deposits':method==='STRIPE_CRYPTO'?'/v1/payments/stripe/crypto-intents':'/v1/payments/stripe/intents';
    const requestBody=method==='RAZORPAY_UPI'?{amountInr:Number(amount),idempotencyKey:key()}:body;
    try{const r=await fetch(`${API}${endpoint}`,{method:'POST',headers,body:JSON.stringify(requestBody)});const data=await r.json();if(!r.ok)throw new Error(data.message??data.error??'Payment creation failed');if(method==='RAZORPAY_UPI'){if(data.payment?.upiUrl)window.open(data.payment.upiUrl,'_blank','noopener,noreferrer');setStatus('Razorpay UPI payment created. Complete it; webhook confirmation credits the wallet.');}else{setClientSecret(data.payment?.clientSecret??'');setStatus(data.payment?.clientSecret?'Complete the secure checkout below.':'Provider did not return a checkout secret.');}}catch(e){setStatus(String(e instanceof Error?e.message:e))}finally{setBusy(false)}
  }
  const stripeReady=Boolean(stripePromise&&clientSecret);
  return <div className="panel payment-hub"><div className="panel-title"><strong>Payment Hub</strong><span>UPI · CARD · CRYPTO</span></div><div className="payment"><strong>₹ {wallet ? (Number(wallet.available_paise)/100).toLocaleString('en-IN',{minimumFractionDigits:2}) : '—'}</strong><span>Available balance</span><small>Locked: ₹ {wallet ? (Number(wallet.locked_paise)/100).toLocaleString('en-IN',{minimumFractionDigits:2}) : '—'}</small><div className="payment-methods">{(['RAZORPAY_UPI','STRIPE_CARD','STRIPE_UPI','STRIPE_CRYPTO'] as Method[]).map(m=><button key={m} className={method===m?'selected':''} onClick={()=>{setMethod(m);setClientSecret('')}}>{m==='RAZORPAY_UPI'?'Razorpay UPI':m==='STRIPE_CARD'?'Stripe Card':m==='STRIPE_UPI'?'Stripe UPI':'Crypto'}</button>)}</div>{method==='STRIPE_CRYPTO'&&<div className="crypto-options"><select value={asset} onChange={e=>setAsset(e.target.value)}><option>USDC</option><option>USDT</option></select><select value={network} onChange={e=>setNetwork(e.target.value)}><option>BASE</option><option>ETHEREUM</option><option>POLYGON</option><option>SOLANA</option></select></div>}<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder={method==='STRIPE_CRYPTO'?'Amount USD':'Amount INR'}/><button onClick={start} disabled={busy}>{busy?'CREATING…':method==='STRIPE_CRYPTO'?'PAY WITH CRYPTO':'ADD FUNDS'}</button>{stripeReady&&stripePromise&&<Elements stripe={stripePromise} options={{clientSecret}}><StripeConfirm clientSecret={clientSecret} onDone={async message=>{setStatus(message);await refreshWallet()}}/></Elements>}{status&&<p className="disabled-note">{status}</p>}{beneficiaries.length>0&&<small>Withdrawal destination: {beneficiaries[0].maskedDestination}</small>}</div></div>;
}

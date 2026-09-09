'use client';

import { useEffect, useMemo, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
const USER = process.env.NEXT_PUBLIC_DEV_USER_ID ?? '';
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;
const idempotencyKey = () => `${crypto.randomUUID()}-${Date.now()}`;

type Rail = 'UPI' | 'STRIPE_CARD' | 'STRIPE_UPI' | 'CRYPTO';
type UpiApp = 'paytm' | 'phonepe' | 'gpay' | 'other';
type UpiFlow = 'collect' | 'intent' | 'link';

type Providers = {
  razorpayUpi?: boolean;
  upiCollect?: boolean;
  upiIntent?: boolean;
  stripeCard?: boolean;
  stripeUpi?: boolean;
  cryptoGateway?: boolean;
};

const APP_HINTS: Record<UpiApp, string> = {
  paytm: 'name@paytm',
  phonepe: 'name@ybl',
  gpay: 'name@oksbi',
  other: 'name@upi',
};

function StripeConfirm({ onDone }: { clientSecret: string; onDone: (message: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  async function confirm() {
    if (!stripe || !elements) return;
    setBusy(true);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });
    setBusy(false);
    if (result.error) onDone(result.error.message ?? 'Payment failed');
    else onDone('Card submitted. Wallet credit waits for a verified Stripe webhook.');
  }
  return (
    <div className="payment-checkout">
      <PaymentElement />
      <button type="button" onClick={confirm} disabled={busy || !stripe || !elements}>
        {busy ? 'CONFIRMING…' : 'CONFIRM CARD PAYMENT'}
      </button>
    </div>
  );
}

export default function PaymentHub({
  wallet,
  beneficiaries,
  refreshWallet,
}: {
  wallet: any;
  beneficiaries: any[];
  refreshWallet: () => Promise<void>;
}) {
  const [amount, setAmount] = useState('1000');
  const [rail, setRail] = useState<Rail>('UPI');
  const [upiApp, setUpiApp] = useState<UpiApp>('gpay');
  const [upiFlow, setUpiFlow] = useState<UpiFlow>('collect');
  const [vpa, setVpa] = useState('');
  const [contact, setContact] = useState('');
  const [asset, setAsset] = useState('USDC');
  const [network, setNetwork] = useState('BASE');
  const [clientSecret, setClientSecret] = useState('');
  const [cryptoAddress, setCryptoAddress] = useState('');
  const [cryptoUrl, setCryptoUrl] = useState('');
  const [upiUrl, setUpiUrl] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<Providers>({});

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (USER) headers['x-user-id'] = USER;

  useEffect(() => {
    fetch(`${API}/v1/payments/providers`)
      .then((r) => r.json())
      .then((data) => setProviders(data))
      .catch(() => setProviders({}));
  }, []);

  const stripeReady = Boolean(stripePromise && clientSecret);
  const available = useMemo(() => ({
    UPI: Boolean(providers.razorpayUpi),
    STRIPE_CARD: Boolean(providers.stripeCard),
    STRIPE_UPI: Boolean(providers.stripeUpi),
    CRYPTO: Boolean(providers.cryptoGateway),
  }), [providers]);

  async function start() {
    if (!USER) {
      setStatus('Production authentication is required. Local testing can use NEXT_PUBLIC_DEV_USER_ID.');
      return;
    }
    setBusy(true);
    setStatus('Creating secure payment…');
    setClientSecret('');
    setCryptoAddress('');
    setCryptoUrl('');
    setUpiUrl('');
    try {
      const key = idempotencyKey();
      let endpoint = '';
      let body: Record<string, unknown>;
      if (rail === 'UPI') {
        endpoint = '/v1/wallet/deposits';
        body = {
          amountInr: Number(amount),
          idempotencyKey: key,
          flow: upiFlow,
          app: upiApp,
          vpa: upiFlow === 'collect' ? vpa.trim().toLowerCase() : undefined,
          customerContact: contact.trim() || undefined,
        };
      } else if (rail === 'CRYPTO') {
        endpoint = '/v1/payments/crypto/intents';
        body = { amountUsd: Number(amount), asset, network, idempotencyKey: key };
      } else {
        endpoint = '/v1/payments/stripe/intents';
        body = { amountInr: Number(amount), method: rail, idempotencyKey: key, purpose: 'TRADING_FUNDING' };
      }
      const r = await fetch(`${API}${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message ?? data.error ?? 'Payment creation failed');
      if (rail === 'UPI') {
        const payment = data.payment ?? {};
        const appLink = upiApp === 'paytm' ? payment.appLinks?.paytm
          : upiApp === 'phonepe' ? payment.appLinks?.phonepe
            : upiApp === 'gpay' ? payment.appLinks?.gpay
              : payment.appLinks?.generic;
        const openUrl = appLink ?? payment.upiUrl;
        if (openUrl) {
          setUpiUrl(openUrl);
          window.open(openUrl, '_blank', 'noopener,noreferrer');
        }
        if (upiFlow === 'collect') setStatus(`Collect request sent to ${vpa || 'your UPI ID'}. Approve it in Paytm, PhonePe, or Google Pay. Wallet credit waits for a verified webhook.`);
        else setStatus('Open Paytm, PhonePe, or Google Pay to complete UPI Intent. Wallet credit waits for a verified webhook.');
      } else if (rail === 'CRYPTO') {
        setCryptoAddress(data.payment?.depositAddress ?? '');
        setCryptoUrl(data.payment?.paymentUrl ?? '');
        setStatus(data.payment?.depositAddress
          ? 'Send the requested asset on the selected network. INR credit occurs only after provider confirmation.'
          : 'Crypto payment created.');
      } else {
        setClientSecret(data.payment?.clientSecret ?? '');
        setStatus(data.payment?.clientSecret
          ? 'Complete the Stripe card checkout below. The wallet is credited only after webhook verification.'
          : 'Stripe did not return a client secret.');
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel payment-hub">
      <div className="panel-title">
        <strong>Payment Hub</strong>
        <span>UPI ID · CARD · CRYPTO</span>
      </div>
      <div className="payment">
        <strong>₹ {wallet ? (Number(wallet.available_paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}</strong>
        <span>Available balance</span>
        <small>Locked: ₹ {wallet ? (Number(wallet.locked_paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}</small>
        <div className="payment-methods">
          {([
            ['UPI', 'UPI (Paytm / PhonePe / GPay)'],
            ['STRIPE_CARD', 'Stripe Card'],
            ['STRIPE_UPI', 'Stripe UPI'],
            ['CRYPTO', 'Crypto'],
          ] as Array<[Rail, string]>).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={rail === id ? 'selected' : ''}
              disabled={providers && Object.keys(providers).length > 0 ? !available[id] : false}
              onClick={() => { setRail(id); setClientSecret(''); setCryptoAddress(''); setUpiUrl(''); }}
            >
              {label}
            </button>
          ))}
        </div>
        {rail === 'UPI' && (
          <div className="upi-options">
            <div className="payment-methods upi-apps">
              {([
                ['gpay', 'Google Pay'],
                ['phonepe', 'PhonePe'],
                ['paytm', 'Paytm'],
                ['other', 'Other UPI'],
              ] as Array<[UpiApp, string]>).map(([id, label]) => (
                <button key={id} type="button" className={upiApp === id ? 'selected' : ''} onClick={() => setUpiApp(id)}>{label}</button>
              ))}
            </div>
            <div className="payment-methods upi-apps">
              <button type="button" className={upiFlow === 'collect' ? 'selected' : ''} disabled={providers.upiCollect === false} onClick={() => setUpiFlow('collect')}>Pay via UPI ID</button>
              <button type="button" className={upiFlow === 'intent' ? 'selected' : ''} disabled={providers.upiIntent === false} onClick={() => setUpiFlow('intent')}>Open UPI app</button>
              <button type="button" className={upiFlow === 'link' ? 'selected' : ''} onClick={() => setUpiFlow('link')}>Checkout link / QR</button>
            </div>
            {upiFlow === 'collect' && (
              <>
                <input value={vpa} onChange={(e) => setVpa(e.target.value)} placeholder={`UPI ID · ${APP_HINTS[upiApp]}`} autoComplete="off" />
                <input inputMode="numeric" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Mobile number linked to UPI (10 digits)" />
              </>
            )}
          </div>
        )}
        {rail === 'CRYPTO' && (
          <div className="crypto-options">
            <select value={asset} onChange={(e) => setAsset(e.target.value)}><option>USDC</option><option>USDT</option></select>
            <select value={network} onChange={(e) => setNetwork(e.target.value)}><option>BASE</option><option>ETHEREUM</option><option>POLYGON</option><option>SOLANA</option></select>
          </div>
        )}
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={rail === 'CRYPTO' ? 'Amount USD' : 'Amount INR'} />
        <button type="button" onClick={start} disabled={busy}>{busy ? 'CREATING…' : rail === 'CRYPTO' ? 'CREATE CRYPTO DEPOSIT' : 'ADD FUNDS'}</button>
        {upiUrl && <div className="crypto-deposit"><small>UPI checkout</small><a href={upiUrl} target="_blank" rel="noreferrer">OPEN UPI APP</a></div>}
        {cryptoAddress && (
          <div className="crypto-deposit">
            <small>Deposit address</small>
            <code>{cryptoAddress}</code>
            {cryptoUrl && <a href={cryptoUrl} target="_blank" rel="noreferrer">OPEN CRYPTO CHECKOUT</a>}
          </div>
        )}
        {stripeReady && stripePromise && (
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#d4a94a', colorBackground: '#111111', colorText: '#eeeeee' } } }}>
            <StripeConfirm clientSecret={clientSecret} onDone={async (message) => { setStatus(message); await refreshWallet(); }} />
          </Elements>
        )}
        {status && <p className="disabled-note">{status}</p>}
        {beneficiaries.length > 0 && <small>Withdrawal destination: {beneficiaries[0].maskedDestination}</small>}
      </div>
    </div>
  );
}

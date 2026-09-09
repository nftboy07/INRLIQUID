import Fastify from 'fastify';
import rawBody from 'fastify-raw-body';
import cors from '@fastify/cors';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { z } from 'zod';
import { createCardOrUpiPaymentSchema, createOrderRequestSchema, createPaymentIntentSchema, createTpSlRequestSchema, createWalletDepositSchema, vpaSchema, type BrokerAdapter, type MarketDataAdapter, type UpiAdapter } from '@inrliquid/domain';
import { RazorpayUpiAdapter, razorpayEventId, validateRazorpayVpa, verifyStripeWebhook, type StripeConfig, CryptoGatewayAdapter, UpstoxAdapter, cancelStripePaymentIntent } from '@inrliquid/adapters';
import { createBeneficiaryBank, createBeneficiaryContact, createBeneficiaryVpa, createDeposit, createWithdrawal, getWallet, listBeneficiaries, listWalletTransactions, saveBeneficiary } from './wallet.js';
import { createStripeWalletPayment, ingestProviderWebhook, settleRazorpayPaymentCaptured, settleRazorpayPaymentFailed, settleRazorpayPayout, settleStripeWebhook } from './payments.js';
import { registerCryptoRoutes } from './crypto-routes.js';
import { authenticateRequest, productionAuthConfigured } from './auth.js';
import { applyUpstoxOrderWebhook, cancelUserOrder, modifyUserOrder, placeUserOrder, placeUserTpSl } from './trading.js';
import { createUpstoxAuthorizationUrl, exchangeUpstoxCode } from './upstox-oauth.js';

const app=Fastify({logger:true,bodyLimit:1024*1024});
await app.register(rawBody,{field:'rawBody',global:false,encoding:'utf8',runFirst:true});
const webOrigin=process.env.WEB_ORIGIN;
await app.register(cors,{
  origin:(origin,cb)=>{
    if(!origin) return cb(null,true);
    if(webOrigin&&origin===webOrigin) return cb(null,true);
    if(process.env.NODE_ENV!=='production'&&/^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null,true);
    cb(null,false);
  },
  credentials:true,
});
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:Number(process.env.DB_POOL_MAX??20),connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
const unavailable=(name:string)=>new Error(`${name} provider is not configured for live operation`);
const razorpayConfigured=Boolean(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET&&process.env.RAZORPAY_WEBHOOK_SECRET);
const upiCollectEnabled=process.env.UPI_COLLECT_ENABLED!=='false';
const razorpayConfig=razorpayConfigured?{keyId:process.env.RAZORPAY_KEY_ID!,keySecret:process.env.RAZORPAY_KEY_SECRET!,apiBaseUrl:process.env.RAZORPAY_API_BASE_URL??process.env.UPI_API_BASE_URL,payoutAccountNumber:process.env.RAZORPAYX_PAYOUT_ACCOUNT_NUMBER,collectEnabled:upiCollectEnabled}:null;
const razorpay=razorpayConfig?new RazorpayUpiAdapter(razorpayConfig):null;
const stripeConfigured=Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_WEBHOOK_SECRET);
const stripeConfig:StripeConfig|null=stripeConfigured?{secretKey:process.env.STRIPE_SECRET_KEY!,apiBaseUrl:process.env.STRIPE_API_BASE_URL}:null;
const stripeCardEnabled=stripeConfigured&&process.env.STRIPE_CARD_ENABLED!=='false';
const stripeUpiEnabled=stripeConfigured&&process.env.STRIPE_UPI_ENABLED==='true';
const cryptoGateway=process.env.CRYPTO_GATEWAY_API_BASE_URL&&process.env.CRYPTO_GATEWAY_API_KEY&&process.env.CRYPTO_GATEWAY_WEBHOOK_SECRET?new CryptoGatewayAdapter({apiBaseUrl:process.env.CRYPTO_GATEWAY_API_BASE_URL,apiKey:process.env.CRYPTO_GATEWAY_API_KEY,webhookSecret:process.env.CRYPTO_GATEWAY_WEBHOOK_SECRET}):null;
let instrumentMap:Record<string,string>={};
if(process.env.UPSTOX_INSTRUMENT_MAP_JSON){try{const parsed=JSON.parse(process.env.UPSTOX_INSTRUMENT_MAP_JSON);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('must be an object');instrumentMap=parsed as Record<string,string>;}catch(error){throw new Error(`UPSTOX_INSTRUMENT_MAP_JSON_INVALID:${String(error)}`);}}
const sharedUpstoxConfigured=Boolean(process.env.UPSTOX_ACCESS_TOKEN&&Object.keys(instrumentMap).length>0);
const upstox=sharedUpstoxConfigured?new UpstoxAdapter({accessToken:process.env.UPSTOX_ACCESS_TOKEN!,orderBaseUrl:process.env.UPSTOX_ORDER_BASE_URL,marketBaseUrl:process.env.UPSTOX_MARKET_BASE_URL,instrumentMap}):null;
const broker:BrokerAdapter=upstox??{async placeOrder(){throw unavailable('Broker')},async placeTpSl(){throw unavailable('Broker')},async cancelOrder(){throw unavailable('Broker')},async modifyOrder(){throw unavailable('Broker')}};
const marketData:MarketDataAdapter=upstox??{async quote(){throw unavailable('Market-data')},async orderBook(){throw unavailable('Market-data')}};
const upi:UpiAdapter=razorpay??{async createPaymentIntent(){throw unavailable('UPI')},async cancelPaymentIntent(){throw unavailable('UPI')}};
function auth(request:any){return authenticateRequest(request);}
function signature(raw:string,header:string|undefined,secret:string|undefined){if(!header||!secret)return false;const expected=Buffer.from(createHmac('sha256',secret).update(raw,'utf8').digest('hex'),'utf8'),received=Buffer.from(header,'utf8');return expected.length===received.length&&timingSafeEqual(expected,received);}
function authError(reply:any,error:unknown){return reply.code(401).send({error:String(error)});}

app.get('/health',async()=>({status:'ok',service:'inrliquid-api',providers:{razorpay:razorpayConfigured,stripe:stripeConfigured,stripeCard:stripeCardEnabled,stripeUpi:stripeUpiEnabled,cryptoGateway:Boolean(cryptoGateway),upstox:sharedUpstoxConfigured,upstoxOAuth:Boolean(process.env.UPSTOX_CLIENT_ID&&process.env.UPSTOX_CLIENT_SECRET&&process.env.UPSTOX_REDIRECT_URI)},auth:{production:productionAuthConfigured(),devHeader:process.env.ALLOW_DEV_USER_HEADER==='true'}}));
app.get('/ready',async(_request,reply)=>{const checks={database:Boolean(process.env.DATABASE_URL),auth:productionAuthConfigured(),crypto:Boolean(cryptoGateway),fiatPayments:razorpayConfigured||stripeCardEnabled,withdrawals:Boolean(razorpayConfig?.payoutAccountNumber),brokerIntegration:Boolean(sharedUpstoxConfigured||(process.env.UPSTOX_CLIENT_ID&&process.env.UPSTOX_CLIENT_SECRET&&process.env.UPSTOX_REDIRECT_URI)),marketData:sharedUpstoxConfigured};const ready=Object.values(checks).every(Boolean);return reply.code(ready?200:503).send({ready,checks});});
app.get('/v1/payments/providers',async()=>({
  razorpayUpi:razorpayConfigured,
  upiCollect:razorpayConfigured&&upiCollectEnabled,
  upiIntent:razorpayConfigured,
  upiApps:['paytm','phonepe','gpay'],
  stripeCard:stripeCardEnabled,
  stripeUpi:stripeUpiEnabled,
  stripeConfigured,
  cryptoGateway:Boolean(cryptoGateway),
  broker:sharedUpstoxConfigured,
  brokerOAuth:Boolean(process.env.UPSTOX_CLIENT_ID&&process.env.UPSTOX_CLIENT_SECRET&&process.env.UPSTOX_REDIRECT_URI),
  marketData:sharedUpstoxConfigured,
}));

app.post('/v1/webhooks/razorpay',{config:{rawBody:true}},async(request,reply)=>{
  const raw=String((request as any).rawBody??'');
  if(!signature(raw,request.headers['x-razorpay-signature'] as string|undefined,process.env.RAZORPAY_WEBHOOK_SECRET))return reply.code(401).send({error:'INVALID_WEBHOOK_SIGNATURE'});
  let payload:Record<string,any>;
  try{payload=JSON.parse(raw);}catch{return reply.code(400).send({error:'INVALID_WEBHOOK_JSON'});}
  const eventType=String(payload.event??'unknown');
  const eventId=razorpayEventId(payload);
  const result=await ingestProviderWebhook(pool,{eventId,provider:'razorpay',eventType,payload,settle:async(client)=>{
    if(eventType==='payment.captured'||eventType==='payment_link.paid'||eventType==='order.paid')await settleRazorpayPaymentCaptured(client,payload);
    else if(eventType==='payment.failed')await settleRazorpayPaymentFailed(client,payload);
    else if(['payout.pending','payout.queued','payout.initiated','payout.processed','payout.failed','payout.reversed'].includes(eventType))await settleRazorpayPayout(client,eventType,payload);
  }});
  return reply.send(result);
});
app.post('/v1/webhooks/stripe',{config:{rawBody:true}},async(request,reply)=>{
  const raw=String((request as any).rawBody??'');
  if(!verifyStripeWebhook(raw,request.headers['stripe-signature'] as string|undefined,process.env.STRIPE_WEBHOOK_SECRET))return reply.code(401).send({error:'INVALID_WEBHOOK_SIGNATURE'});
  let payload:Record<string,any>;
  try{payload=JSON.parse(raw);}catch{return reply.code(400).send({error:'INVALID_WEBHOOK_JSON'});}
  const eventId=String(payload.id??'');
  if(!eventId)return reply.code(400).send({error:'INVALID_STRIPE_EVENT_ID'});
  const result=await ingestProviderWebhook(pool,{eventId,provider:'stripe',eventType:String(payload.type??'unknown'),payload,settle:(client)=>settleStripeWebhook(pool,payload,client)});
  return reply.send(result);
});
app.post('/v1/webhooks/upstox',async(request,reply)=>{try{return reply.send(await applyUpstoxOrderWebhook(pool,request.body as Record<string,unknown>));}catch(error){request.log.error(error);return reply.code(500).send({error:'UPSTOX_WEBHOOK_PROCESSING_FAILED'});}});

app.get('/v1/broker/upstox/authorize',async(request,reply)=>{try{return reply.send({authorizationUrl:createUpstoxAuthorizationUrl(auth(request))});}catch(error){return String(error).includes('AUTH_')?authError(reply,error):reply.code(503).send({error:String(error)});}});
app.get('/v1/broker/upstox/callback',async(request,reply)=>{const p=z.object({code:z.string().min(1),state:z.string().min(20),error:z.string().optional(),error_description:z.string().optional()}).safeParse(request.query);if(!p.success)return reply.code(400).send({error:'INVALID_OAUTH_CALLBACK'});if(p.data.error)return reply.code(400).send({error:p.data.error,message:p.data.error_description});try{return reply.send({ok:true,linked:await exchangeUpstoxCode(pool,p.data.code,p.data.state)});}catch(error){return reply.code(400).send({error:String(error)});}});

app.get('/v1/wallet',async(request,reply)=>{try{return await getWallet(pool,auth(request));}catch(error){return authError(reply,error);}});
app.get('/v1/wallet/transactions',async(request,reply)=>{try{const q=z.object({limit:z.coerce.number().int().min(1).max(200).default(100)}).parse(request.query);return await listWalletTransactions(pool,auth(request),q.limit);}catch(error){return authError(reply,error);}});
app.get('/v1/wallet/beneficiaries',async(request,reply)=>{try{return await listBeneficiaries(pool,auth(request));}catch(error){return authError(reply,error);}});
app.post('/v1/wallet/deposits',async(request,reply)=>{
  const p=createWalletDepositSchema.safeParse(request.body);
  if(!p.success)return reply.code(400).send({error:'INVALID_DEPOSIT',issues:p.error.issues});
  try{
    if(!razorpay)throw unavailable('Razorpay');
    const userId=auth(request);
    return reply.code(201).send(await createDeposit(pool,{userId},p.data,razorpay,{
      ip:request.ip,
      userAgent:typeof request.headers['user-agent']==='string'?request.headers['user-agent']:undefined,
      referer:typeof request.headers.referer==='string'?request.headers.referer:webOrigin,
    }));
  }catch(error){return String(error).includes('AUTH_')?authError(reply,error):reply.code(503).send({error:'DEPOSIT_UNAVAILABLE',message:String(error)});}
});
app.post('/v1/wallet/beneficiaries',async(request,reply)=>{const p=z.object({name:z.string().min(3).max(50),email:z.string().email(),phone:z.string().regex(/^\d{10}$/),mode:z.enum(['UPI','IMPS','NEFT','RTGS']),vpa:z.string().regex(/^[^\s@]+@[^\s@]+$/).optional(),bankAccountNumber:z.string().min(6).max(30).optional(),ifsc:z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/).optional(),label:z.string().max(50).optional()}).superRefine((v,c)=>{if(v.mode==='UPI'&&!v.vpa)c.addIssue({code:'custom',path:['vpa'],message:'VPA is required for UPI'});if(v.mode!=='UPI'&&(!v.bankAccountNumber||!v.ifsc))c.addIssue({code:'custom',path:['bankAccountNumber'],message:'Bank account and IFSC are required'});}).safeParse(request.body);if(!p.success)return reply.code(400).send({error:'INVALID_BENEFICIARY',issues:p.error.issues});try{const uid=auth(request);if(!razorpayConfig)throw unavailable('RazorpayX');const contact=await createBeneficiaryContact(razorpayConfig,{name:p.data.name,email:p.data.email,phone:p.data.phone,referenceId:uid});const fund=p.data.mode==='UPI'?await createBeneficiaryVpa(razorpayConfig,{contactId:String(contact.id),vpa:p.data.vpa!}):await createBeneficiaryBank(razorpayConfig,{contactId:String(contact.id),name:p.data.name,ifsc:p.data.ifsc!,accountNumber:p.data.bankAccountNumber!});const masked=p.data.mode==='UPI'?p.data.vpa!.replace(/(^.).*(@.*$)/,'$1***$2'):`${p.data.ifsc} ••••${p.data.bankAccountNumber!.slice(-4)}`;return reply.code(201).send(await saveBeneficiary(pool,uid,String(fund.id),String(contact.id),p.data.mode,masked,p.data.label));}catch(error){return String(error).includes('AUTH_')?authError(reply,error):reply.code(503).send({error:'BENEFICIARY_UNAVAILABLE',message:String(error)});}});
app.post('/v1/wallet/withdrawals',async(request,reply)=>{const p=z.object({amountInr:z.number().positive().finite().max(10000000),fundAccountId:z.string().min(1),mode:z.enum(['UPI','IMPS','NEFT','RTGS']).default('UPI'),idempotencyKey:z.string().min(16).max(128)}).safeParse(request.body);if(!p.success)return reply.code(400).send({error:'INVALID_WITHDRAWAL',issues:p.error.issues});try{const uid=auth(request);if(!razorpayConfig||!razorpayConfig.payoutAccountNumber)throw unavailable('RazorpayX');const b=await pool.query(`SELECT 1 FROM withdrawal_beneficiaries WHERE user_id=$1 AND provider_fund_account_id=$2 AND status='ACTIVE'`,[uid,p.data.fundAccountId]);if(!b.rowCount)return reply.code(400).send({error:'BENEFICIARY_NOT_ACTIVE'});return reply.code(201).send(await createWithdrawal(pool,{userId:uid},p.data.amountInr,p.data.fundAccountId,p.data.mode,p.data.idempotencyKey,razorpayConfig));}catch(error){return String(error).includes('AUTH_')?authError(reply,error):reply.code(503).send({error:'WITHDRAWAL_UNAVAILABLE',message:String(error)});}});

app.post('/v1/payments/stripe/intents',async(request,reply)=>{const p=createCardOrUpiPaymentSchema.safeParse(request.body);if(!p.success)return reply.code(400).send({error:'INVALID_STRIPE_PAYMENT',issues:p.error.issues});try{if(!stripeConfig)throw unavailable('Stripe');const method=p.data.method==='STRIPE_CARD'?'card':'upi';if(method==='card'&&!stripeCardEnabled)throw unavailable('Stripe card');if(method==='upi'&&!stripeUpiEnabled)throw new Error('STRIPE_UPI_NOT_ENABLED_FOR_THIS_ACCOUNT');return reply.code(201).send(await createStripeWalletPayment(pool,auth(request),p.data.amountInr,method,p.data.idempotencyKey,stripeConfig));}catch(error){return String(error).includes('AUTH_')?authError(reply,error):reply.code(503).send({error:'STRIPE_UNAVAILABLE',message:String(error)});}});
app.delete('/v1/payments/stripe/intents/:paymentId',async(request,reply)=>{
  const paymentId=z.string().min(1).parse((request.params as {paymentId:string}).paymentId);
  try{
    const userId=auth(request);
    if(!stripeConfig)throw unavailable('Stripe');
    const owned=await pool.query(`SELECT 1 FROM payment_intents WHERE user_id=$1 AND provider='stripe' AND provider_payment_id=$2`,[userId,paymentId]);
    if(!owned.rowCount)return reply.code(404).send({error:'STRIPE_INTENT_NOT_FOUND'});
    await cancelStripePaymentIntent(stripeConfig,paymentId);
    return reply.code(204).send();
  }catch(error){return String(error).includes('AUTH_')?authError(reply,error):reply.code(503).send({error:'STRIPE_UNAVAILABLE',message:String(error)});}
});
app.post('/v1/payments/upi/intents',async(request,reply)=>{
  const p=createPaymentIntentSchema.safeParse(request.body);
  if(!p.success)return reply.code(400).send({error:'INVALID_PAYMENT',issues:p.error.issues});
  try{
    if(!razorpay)throw unavailable('UPI');
    const userId=auth(request);
    return reply.code(201).send(await createDeposit(pool,{userId},{...p.data,purpose:p.data.purpose==='TRADING_FUNDING'||p.data.purpose==='SETTLEMENT'||p.data.purpose==='FEES'?p.data.purpose:'TRADING_FUNDING'},razorpay,{
      ip:request.ip,
      userAgent:typeof request.headers['user-agent']==='string'?request.headers['user-agent']:undefined,
      referer:typeof request.headers.referer==='string'?request.headers.referer:webOrigin,
    }));
  }catch(error){return String(error).includes('AUTH_')?authError(reply,error):reply.code(503).send({error:'UPI_UNAVAILABLE',message:String(error)});}
});
app.post('/v1/payments/upi/validate',async(request,reply)=>{
  const p=z.object({vpa:vpaSchema}).safeParse(request.body);
  if(!p.success)return reply.code(400).send({error:'INVALID_VPA',issues:p.error.issues});
  try{
    auth(request);
    if(!razorpayConfig)throw unavailable('UPI');
    return await validateRazorpayVpa(razorpayConfig,p.data.vpa);
  }catch(error){return String(error).includes('AUTH_')?authError(reply,error):reply.code(503).send({error:'UPI_UNAVAILABLE',message:String(error)});}
});
app.delete('/v1/payments/upi/intents/:paymentId',async(request,reply)=>{const paymentId=z.string().min(1).parse((request.params as {paymentId:string}).paymentId);try{auth(request);await upi.cancelPaymentIntent(paymentId);return reply.code(204).send();}catch(error){return String(error).includes('AUTH_')?authError(reply,error):reply.code(503).send({error:'UPI_UNAVAILABLE',message:String(error)});}});

app.get('/v1/market/:exchange/:symbol/quote',async(request,reply)=>{const p=z.object({exchange:z.enum(['NSE','BSE']),symbol:z.string().trim().min(1).max(30)}).parse(request.params);try{auth(request);return await marketData.quote(p.symbol.toUpperCase(),p.exchange);}catch(error){return String(error).includes('AUTH_')?authError(reply,error):reply.code(503).send({error:'MARKET_DATA_UNAVAILABLE',message:String(error)});}});
app.get('/v1/market/:exchange/:symbol/orderbook',async(request,reply)=>{const p=z.object({exchange:z.enum(['NSE','BSE']),symbol:z.string().trim().min(1).max(30)}).parse(request.params);try{auth(request);return await marketData.orderBook(p.symbol.toUpperCase(),p.exchange);}catch(error){return String(error).includes('AUTH_')?authError(reply,error):reply.code(503).send({error:'ORDERBOOK_UNAVAILABLE',message:String(error)});}});

app.post('/v1/orders',async(request,reply)=>{const p=createOrderRequestSchema.safeParse(request.body);if(!p.success)return reply.code(400).send({error:'INVALID_ORDER',issues:p.error.issues});try{return reply.code(201).send(await placeUserOrder(pool,auth(request),p.data));}catch(error){const message=String(error);if(message.includes('AUTH_'))return authError(reply,error);if(message==='ORDER_SUBMISSION_AMBIGUOUS')return reply.code(503).send({error:message});if(message.includes('BROKER_')||message.includes('UPSTOX_'))return reply.code(503).send({error:message});return reply.code(503).send({error:'EXECUTION_UNAVAILABLE',message});}});
app.post('/v1/orders/tpsl',async(request,reply)=>{const p=createTpSlRequestSchema.safeParse(request.body);if(!p.success)return reply.code(400).send({error:'INVALID_TPSL',issues:p.error.issues});try{return reply.code(201).send(await placeUserTpSl(pool,auth(request),p.data));}catch(error){const message=String(error);if(message.includes('AUTH_'))return authError(reply,error);return reply.code(503).send({error:'EXECUTION_UNAVAILABLE',message});}});
app.patch('/v1/orders/:orderId',async(request,reply)=>{const orderId=z.string().uuid().parse((request.params as {orderId:string}).orderId),p=createOrderRequestSchema.safeParse(request.body);if(!p.success)return reply.code(400).send({error:'INVALID_ORDER',issues:p.error.issues});try{return reply.send(await modifyUserOrder(pool,auth(request),orderId,p.data));}catch(error){const message=String(error);if(message.includes('AUTH_'))return authError(reply,error);return reply.code(503).send({error:'EXECUTION_UNAVAILABLE',message});}});
app.delete('/v1/orders/:orderId',async(request,reply)=>{const orderId=z.string().uuid().parse((request.params as {orderId:string}).orderId);try{await cancelUserOrder(pool,auth(request),orderId);return reply.code(204).send();}catch(error){const message=String(error);if(message.includes('AUTH_'))return authError(reply,error);return reply.code(503).send({error:'EXECUTION_UNAVAILABLE',message});}});

await registerCryptoRoutes(app,pool,cryptoGateway);
app.addHook('onClose',async()=>{await pool.end();});
await app.listen({port:Number(process.env.PORT??3001),host:process.env.HOST??'0.0.0.0'});

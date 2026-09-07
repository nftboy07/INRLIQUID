import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
const uuid=z.string().uuid();
function b64url(input:string){return Buffer.from(input,'base64url');}
function cookieToken(cookie:string|undefined){if(!cookie)return undefined;const match=cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('inrliquid_token='));return match?.slice('inrliquid_token='.length);}
export function authenticateRequest(request:{headers:Record<string,string|string[]|undefined>}){
 if(process.env.ALLOW_DEV_USER_HEADER==='true'){const dev=request.headers['x-user-id'];if(typeof dev==='string'&&uuid.safeParse(dev).success)return dev;}
 const secret=process.env.AUTH_HMAC_SECRET;if(!secret)throw new Error('AUTH_REQUIRED');
 const header=request.headers.authorization;const token=typeof header==='string'&&header.startsWith('Bearer ')?header.slice(7).trim():cookieToken(typeof request.headers.cookie==='string'?request.headers.cookie:undefined);if(!token)throw new Error('AUTH_REQUIRED');
 const parts=token.split('.');if(parts.length!==3)throw new Error('AUTH_INVALID_TOKEN');const [encodedHeader,encodedPayload,encodedSignature]=parts;let tokenHeader:{alg?:unknown};try{tokenHeader=JSON.parse(b64url(encodedHeader).toString('utf8'));}catch{throw new Error('AUTH_INVALID_TOKEN');}if(tokenHeader.alg!=='HS256')throw new Error('AUTH_INVALID_TOKEN');
 const expected=createHmac('sha256',secret).update(`${encodedHeader}.${encodedPayload}`).digest(),supplied=b64url(encodedSignature);if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))throw new Error('AUTH_INVALID_TOKEN');
 let payload:{sub?:unknown;exp?:unknown;iss?:unknown};try{payload=JSON.parse(b64url(encodedPayload).toString('utf8'));}catch{throw new Error('AUTH_INVALID_TOKEN');}
 if(payload.iss!==undefined&&payload.iss!==(process.env.AUTH_ISSUER??'inrliquid'))throw new Error('AUTH_INVALID_TOKEN');if(typeof payload.exp!=='number'||payload.exp<=Math.floor(Date.now()/1000))throw new Error('AUTH_TOKEN_EXPIRED');if(typeof payload.sub!=='string'||!uuid.safeParse(payload.sub).success)throw new Error('AUTH_INVALID_SUBJECT');return payload.sub;
}
export function productionAuthConfigured(){return Boolean(process.env.AUTH_HMAC_SECRET)&&process.env.ALLOW_DEV_USER_HEADER!=='true';}

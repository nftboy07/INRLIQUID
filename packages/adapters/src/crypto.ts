export interface CryptoGatewayConfig { apiBaseUrl: string; apiKey: string; webhookSecret?: string; }
export interface CryptoPaymentRequest {
  amountUsd: number;
  asset: string;
  network: string;
  idempotencyKey: string;
  reference: string;
  settlementCurrency: 'INR';
}
export interface CryptoPaymentResponse {
  providerPaymentId: string;
  amountUsd: number;
  asset: string;
  network: string;
  depositAddress: string;
  paymentUrl?: string;
  status: 'CREATED'|'PENDING';
  expiresAt?: string;
  quotedInr?: number;
  quotedRate?: number;
  providerFeeUsd?: number;
}
export class CryptoGatewayAdapter {
  constructor(private readonly config: CryptoGatewayConfig) {}
  async createPayment(input: CryptoPaymentRequest): Promise<CryptoPaymentResponse> {
    const response = await fetch(`${this.config.apiBaseUrl.replace(/\/$/, '')}/v1/payments`, {
      method:'POST',
      headers:{Authorization:`Bearer ${this.config.apiKey}`,'Content-Type':'application/json','Idempotency-Key':input.idempotencyKey},
      body:JSON.stringify(input)
    });
    if(!response.ok) throw new Error(`Crypto gateway payment failed: ${response.status} ${await response.text()}`);
    const data=await response.json() as CryptoPaymentResponse;
    if(!data.providerPaymentId||!data.depositAddress) throw new Error('Crypto gateway returned an invalid payment');
    if(data.quotedInr!==undefined && (!Number.isFinite(data.quotedInr)||data.quotedInr<=0)) throw new Error('Crypto gateway returned an invalid INR quote');
    return data;
  }
  async getPayment(providerPaymentId:string){
    const response=await fetch(`${this.config.apiBaseUrl.replace(/\/$/, '')}/v1/payments/${encodeURIComponent(providerPaymentId)}`,{headers:{Authorization:`Bearer ${this.config.apiKey}`}});
    if(!response.ok) throw new Error(`Crypto gateway lookup failed: ${response.status} ${await response.text()}`);
    return await response.json() as CryptoPaymentResponse & {confirmations?:number;txHash?:string;settledInr?:number;settledRate?:number;settledFeeUsd?:number};
  }
  async cancelPayment(providerPaymentId:string){
    const response=await fetch(`${this.config.apiBaseUrl.replace(/\/$/, '')}/v1/payments/${encodeURIComponent(providerPaymentId)}/cancel`,{method:'POST',headers:{Authorization:`Bearer ${this.config.apiKey}`}});
    if(!response.ok) throw new Error(`Crypto gateway cancellation failed: ${response.status} ${await response.text()}`);
  }
}

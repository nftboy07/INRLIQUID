export interface CryptoGatewayConfig { apiBaseUrl: string; apiKey: string; webhookSecret?: string; }
export interface CryptoPaymentRequest { amountUsd: number; asset: string; network: string; idempotencyKey: string; reference: string; }
export interface CryptoPaymentResponse { providerPaymentId: string; amountUsd: number; asset: string; network: string; depositAddress: string; paymentUrl?: string; status: 'CREATED'|'PENDING'; expiresAt?: string; }
export class CryptoGatewayAdapter {
  constructor(private readonly config: CryptoGatewayConfig) {}
  async createPayment(input: CryptoPaymentRequest): Promise<CryptoPaymentResponse> {
    const response = await fetch(`${this.config.apiBaseUrl.replace(/\/$/, '')}/v1/payments`, { method:'POST', headers:{Authorization:`Bearer ${this.config.apiKey}`,'Content-Type':'application/json','Idempotency-Key':input.idempotencyKey}, body:JSON.stringify(input) });
    if(!response.ok) throw new Error(`Crypto gateway payment failed: ${response.status} ${await response.text()}`);
    return await response.json() as CryptoPaymentResponse;
  }
  async getPayment(providerPaymentId:string){
    const response=await fetch(`${this.config.apiBaseUrl.replace(/\/$/, '')}/v1/payments/${encodeURIComponent(providerPaymentId)}`,{headers:{Authorization:`Bearer ${this.config.apiKey}`}});
    if(!response.ok) throw new Error(`Crypto gateway lookup failed: ${response.status} ${await response.text()}`);
    return await response.json() as CryptoPaymentResponse & {confirmations?:number;txHash?:string};
  }
  async cancelPayment(providerPaymentId:string){
    const response=await fetch(`${this.config.apiBaseUrl.replace(/\/$/, '')}/v1/payments/${encodeURIComponent(providerPaymentId)}/cancel`,{method:'POST',headers:{Authorization:`Bearer ${this.config.apiKey}`}});
    if(!response.ok) throw new Error(`Crypto gateway cancellation failed: ${response.status} ${await response.text()}`);
  }
}

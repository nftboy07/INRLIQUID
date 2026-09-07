import type { BrokerAdapter, MarketDataAdapter, UpiAdapter } from '@inrliquid/domain';

export type { BrokerAdapter, MarketDataAdapter, UpiAdapter } from '@inrliquid/domain';
export { RazorpayUpiAdapter, createRazorpayPayout } from './razorpay.js';
export type { RazorpayConfig, WithdrawalRequest } from './razorpay.js';

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  credentialsConfigured: boolean;
}

export const providerStatus = (config: ProviderConfig) => ({
  provider: config.name,
  configured: config.credentialsConfigured,
  baseUrl: config.baseUrl,
  executionEnabled: config.credentialsConfigured
});

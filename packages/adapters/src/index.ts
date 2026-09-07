import type { BrokerAdapter, MarketDataAdapter, UpiAdapter } from '@inrliquid/domain';
export type { BrokerAdapter, MarketDataAdapter, UpiAdapter } from '@inrliquid/domain';
export { RazorpayUpiAdapter, RazorpayRequestError, createRazorpayPayout, createRazorpayContact, createRazorpayBankFundAccount, createRazorpayVpaFundAccount, fetchRazorpayPayout } from './razorpay.js';
export type { RazorpayConfig, WithdrawalRequest, RazorpayContactRequest, RazorpayBankBeneficiaryRequest, RazorpayVpaBeneficiaryRequest } from './razorpay.js';
export { createStripePaymentIntent, createStripeCryptoPaymentIntent, cancelStripePaymentIntent, verifyStripeWebhook } from './stripe.js';
export type { StripeConfig, StripeMethod, StripePaymentIntent } from './stripe.js';
export { CryptoGatewayAdapter } from './crypto.js';
export type { CryptoGatewayConfig, CryptoPaymentRequest, CryptoPaymentResponse } from './crypto.js';
export { UpstoxAdapter } from './upstox.js';
export type { UpstoxConfig } from './upstox.js';
export interface ProviderConfig { name: string; baseUrl: string; credentialsConfigured: boolean; }
export const providerStatus = (config: ProviderConfig) => ({ provider: config.name, configured: config.credentialsConfigured, baseUrl: config.baseUrl, executionEnabled: config.credentialsConfigured });

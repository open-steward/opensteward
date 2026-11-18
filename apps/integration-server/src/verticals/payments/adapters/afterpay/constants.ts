/**
 * Afterpay (Block) hosts region-specific APIs. US and Canada run on
 * `api.us.afterpay.com`; Australia/NZ on `api.afterpay.com`.
 */
export const HOSTS = {
  us_sandbox: 'https://api.us-sandbox.afterpay.com',
  us_live: 'https://api.us.afterpay.com',
  au_sandbox: 'https://api-sandbox.afterpay.com',
  au_live: 'https://api.afterpay.com',
} as const

export type AfterpayRegion = keyof typeof HOSTS
export const DEFAULT_REGION: AfterpayRegion = 'us_sandbox'

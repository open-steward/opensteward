/**
 * PayPal REST API constants. PayPal exposes two production environments:
 * sandbox (test) and live. Each has a distinct hostname.
 */

export const HOSTS = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
} as const

export type PayPalEnvironment = keyof typeof HOSTS

export const DEFAULT_PAGE_SIZE = 50

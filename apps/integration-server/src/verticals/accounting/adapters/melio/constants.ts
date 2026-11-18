// Melio Platform API constants
// Partner API docs: https://docs.melio.com (partner-gated)
// Melio is an AP/AR platform: bills (AP), vendors, invoices (AR), payments

export const MELIO_AUTH_URL = 'https://app.meliopayments.com/oauth2/authorize'
export const MELIO_TOKEN_URL = 'https://app.meliopayments.com/oauth2/token'

// Production API base
export const MELIO_API_BASE = 'https://app.meliopayments.com/api/v1'
// Sandbox API base
export const MELIO_SANDBOX_API_BASE = 'https://sandbox.meliopayments.com/api/v1'

// Standard partner OAuth scopes
export const MELIO_DEFAULT_SCOPES = [
  'read:bills',
  'write:bills',
  'read:vendors',
  'write:vendors',
  'read:invoices',
  'write:invoices',
  'read:payments',
  'read:organizations',
]

// Conservative rate limit (Melio doesn't publish exact limits publicly)
export const RATE_LIMIT_RPM = 100
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 50

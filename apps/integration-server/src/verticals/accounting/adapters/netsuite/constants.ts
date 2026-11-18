// Account ID format: 1234567 → base URL: 1234567.suitetalk.api.netsuite.com
export const NETSUITE_AUTH_URL = 'https://system.netsuite.com/app/login/oauth2/authorize.nl'
export const NETSUITE_TOKEN_URL = 'https://accounts.netsuite.com/app/login/oauth2/accesstoken.nl'

export function getApiBase(accountId: string): string {
  const id = accountId.replace(/-/g, '_').toLowerCase()
  return `https://${id}.suitetalk.api.netsuite.com/services/rest`
}

// Rate limit: 15–20 concurrent requests (per integration)
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1000

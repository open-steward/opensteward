export const BC_AUTH_BASE = 'https://login.microsoftonline.com'
export const BC_API_BASE = 'https://api.businesscentral.dynamics.com/v2.0'

export function getAuthUrl(tenantId: string): string {
  return `${BC_AUTH_BASE}/${tenantId}/oauth2/v2.0/authorize`
}

export function getTokenUrl(tenantId: string): string {
  return `${BC_AUTH_BASE}/${tenantId}/oauth2/v2.0/token`
}

export function getApiBase(tenantId: string, environment = 'production'): string {
  return `${BC_API_BASE}/${tenantId}/${environment}/api/v2.0`
}

// Rate limit: 600 req/min per user
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 200

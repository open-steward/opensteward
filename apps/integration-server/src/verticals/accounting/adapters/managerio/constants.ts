// Manager.io is self-hosted. The base URL is configurable per instance.
// Format: https://<your-manager-server>/api2/
export const MANAGERIO_API_BASE_TEMPLATE = '{instanceUrl}/api2/'

export function getManagerioApiBase(instanceUrl: string): string {
  return `${instanceUrl.replace(/\/$/, '')}/api2/`
}

// Rate limit: 300 req/min (effectively unlimited — set conservatively)
export const RATE_LIMIT_RPM = 300
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1000

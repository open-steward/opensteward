// Daftra uses tenant-specific subdomains: https://{subdomain}.daftra.com/api2/
// The DAFTRA_API_BASE is a template; configure via DAFTRA_SUBDOMAIN env var
export const DAFTRA_API_BASE_TEMPLATE = 'https://{subdomain}.daftra.com/api2/'
export const DAFTRA_SETTINGS_URL_TEMPLATE = 'https://{subdomain}.daftra.com/settings/api'
export const RATE_LIMIT_RPM = 60
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200

export function getDaftraApiBase(subdomain: string): string {
  return `https://${subdomain}.daftra.com/api2/`
}

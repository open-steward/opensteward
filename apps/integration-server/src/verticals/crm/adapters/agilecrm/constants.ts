export const DEFAULT_PAGE_SIZE = 25

/** Build the AgileCRM base URL from the tenant domain. */
export function buildBaseUrl(domain: string): string {
  return `https://${domain}.agilecrm.com/dev/api`
}

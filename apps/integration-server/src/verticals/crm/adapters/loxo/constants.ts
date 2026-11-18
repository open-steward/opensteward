/** Loxo REST API constants. */

/**
 * Default Loxo SaaS host. Self-hosted customers may have a custom domain which
 * they supply via credentials.extra.domain.
 */
export const LOXO_DEFAULT_DOMAIN = 'app.loxo.co'

/**
 * Build the per-agency base URL from a domain and agency slug.
 * e.g. https://app.loxo.co/api/acme-search
 */
export function buildBaseUrl(domain: string, agencySlug: string): string {
  return `https://${domain}/api/${agencySlug}`
}

/** Default page size for list endpoints that support per_page. */
export const DEFAULT_PAGE_SIZE = 25

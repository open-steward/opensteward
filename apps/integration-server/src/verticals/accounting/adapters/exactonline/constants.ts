/**
 * Exact Online runs a separate site per country. Authorize, token and REST
 * endpoints all live on the customer's country site, and an account on one
 * site cannot sign in on another, so the region is chosen per connection
 * (`oauthFields`) and kept in `credentials.extra.region`.
 *
 * Closed set: the region selects a host that receives the client secret, so
 * nothing outside this table is ever turned into a URL.
 */
export const EXACT_REGIONS: Readonly<Record<string, string>> = {
  nl: 'https://start.exactonline.nl/api',
  be: 'https://start.exactonline.be/api',
  de: 'https://start.exactonline.de/api',
  uk: 'https://start.exactonline.co.uk/api',
  us: 'https://start.exactonline.com/api',
  es: 'https://start.exactonline.es/api',
  fr: 'https://start.exactonline.fr/api',
}

export const EXACT_REGION_LABELS: Readonly<Record<string, string>> = {
  nl: 'Netherlands (start.exactonline.nl)',
  be: 'Belgium (start.exactonline.be)',
  de: 'Germany (start.exactonline.de)',
  uk: 'United Kingdom (start.exactonline.co.uk)',
  us: 'United States (start.exactonline.com)',
  es: 'Spain (start.exactonline.es)',
  fr: 'France (start.exactonline.fr)',
}

/**
 * Only for connections made before the region was recorded: every one of
 * those was sent to the Dutch site.
 */
export const EXACT_DEFAULT_REGION = 'nl'

/** Trim + lowercase a region code and refuse anything outside {@link EXACT_REGIONS}. */
export function normaliseRegion(raw: string | undefined | null): string {
  const region = (raw ?? '').trim().toLowerCase()
  if (!region) {
    throw new Error(
      'Exact Online region is required (the country site you sign in to, e.g. nl for start.exactonline.nl).',
    )
  }
  if (!Object.prototype.hasOwnProperty.call(EXACT_REGIONS, region)) {
    throw new Error(`Exact Online region must be one of: ${Object.keys(EXACT_REGIONS).join(', ')}.`)
  }
  return region
}

export function getBaseUrl(region: string): string {
  return EXACT_REGIONS[normaliseRegion(region)]
}

export function getAuthUrl(region: string): string {
  return `${getBaseUrl(region)}/oauth2/auth`
}

export function getTokenUrl(region: string): string {
  return `${getBaseUrl(region)}/oauth2/token`
}

// Rate limit: 60 req/min, 5000/day
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1000

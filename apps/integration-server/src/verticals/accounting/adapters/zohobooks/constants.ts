/**
 * Zoho runs separate data centres, each with its own accounts server
 * (authorize + token) and API host. A customer's grant code must be exchanged
 * on the accounts server of their own data centre, and the callback does not
 * receive Zoho's `accounts-server` redirect parameter, so the data centre is
 * chosen per connection (`oauthFields`) and kept in `credentials.extra`.
 *
 * Closed set: the data centre selects a host that receives the client secret,
 * so nothing outside this table is ever turned into a URL.
 *
 * Sources: https://www.zoho.com/accounts/protocol/oauth/multi-dc.html and
 * https://www.zoho.com/books/api/v3/introduction/ (UK is not listed for Zoho
 * Books, so it is not offered).
 */
export interface ZohoDataCentre {
  label: string
  /** Accounts server hosting `/oauth/v2/auth` and `/oauth/v2/token`. */
  accountsUrl: string
  /** API host; Zoho Books lives under `/books/v3`. */
  apiUrl: string
}

export const ZOHO_DATA_CENTRES: Readonly<Record<string, ZohoDataCentre>> = {
  us: { label: 'United States (zoho.com)', accountsUrl: 'https://accounts.zoho.com', apiUrl: 'https://www.zohoapis.com' },
  eu: { label: 'Europe (zoho.eu)', accountsUrl: 'https://accounts.zoho.eu', apiUrl: 'https://www.zohoapis.eu' },
  in: { label: 'India (zoho.in)', accountsUrl: 'https://accounts.zoho.in', apiUrl: 'https://www.zohoapis.in' },
  au: { label: 'Australia (zoho.com.au)', accountsUrl: 'https://accounts.zoho.com.au', apiUrl: 'https://www.zohoapis.com.au' },
  jp: { label: 'Japan (zoho.jp)', accountsUrl: 'https://accounts.zoho.jp', apiUrl: 'https://www.zohoapis.jp' },
  ca: { label: 'Canada (zohocloud.ca)', accountsUrl: 'https://accounts.zohocloud.ca', apiUrl: 'https://www.zohoapis.ca' },
  sa: { label: 'Saudi Arabia (zoho.sa)', accountsUrl: 'https://accounts.zoho.sa', apiUrl: 'https://www.zohoapis.sa' },
  cn: { label: 'China (zoho.com.cn)', accountsUrl: 'https://accounts.zoho.com.cn', apiUrl: 'https://www.zohoapis.com.cn' },
}

/** Only for connections made before the data centre was recorded: all of those used the US pair. */
export const ZOHO_DEFAULT_DATA_CENTRE = 'us'

/** Trim + lowercase a data-centre code and refuse anything outside {@link ZOHO_DATA_CENTRES}. */
export function normaliseDataCentre(raw: string | undefined | null): string {
  const dc = (raw ?? '').trim().toLowerCase()
  if (!dc) {
    throw new Error(
      'Zoho data centre is required (the Zoho domain you sign in at, e.g. us for zoho.com or eu for zoho.eu).',
    )
  }
  if (!Object.prototype.hasOwnProperty.call(ZOHO_DATA_CENTRES, dc)) {
    throw new Error(`Zoho data centre must be one of: ${Object.keys(ZOHO_DATA_CENTRES).join(', ')}.`)
  }
  return dc
}

export function zohoAuthorizeUrl(dataCentre: string): string {
  return `${ZOHO_DATA_CENTRES[normaliseDataCentre(dataCentre)].accountsUrl}/oauth/v2/auth`
}

export function zohoTokenUrl(dataCentre: string): string {
  return `${ZOHO_DATA_CENTRES[normaliseDataCentre(dataCentre)].accountsUrl}/oauth/v2/token`
}

export function zohoBooksApiBase(dataCentre: string): string {
  return `${ZOHO_DATA_CENTRES[normaliseDataCentre(dataCentre)].apiUrl}/books/v3`
}

// Rate limit: 100/min, varies by tier
export const RATE_LIMIT_RPM = 100
export const DEFAULT_PAGE_SIZE = 200
export const MAX_PAGE_SIZE = 200

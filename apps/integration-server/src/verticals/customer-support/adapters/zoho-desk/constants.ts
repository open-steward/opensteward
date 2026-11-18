/**
 * Zoho Desk runs in separate data centres. Each has its own accounts server
 * (authorize + token) and its own Desk API host, and a customer's grant code
 * must be exchanged on the accounts server of the customer's data centre. The
 * connect callback does not receive Zoho's `accounts-server` redirect
 * parameter, so the data centre is chosen per connection (`oauthFields`) and
 * kept in `credentials.extra.dataCentre`. Same approach as
 * accounting/zohobooks, whose table this mirrors. That table cannot be
 * imported here, because each vertical compiles as its own TypeScript project.
 *
 * The set is closed: the data centre picks a host that receives the client
 * secret, so nothing outside this table ever becomes a URL. A data centre is
 * listed only when both of its hosts are documented:
 *   - Desk API host: "API Endpoints by Data Center" table,
 *     https://desk.zoho.com/DeskAPIDocument (US, IN, AU, CA, SA, JP, CN, EU,
 *     SG, UAE).
 *   - Accounts server: https://www.zoho.com/accounts/protocol/oauth/multi-dc.html
 *     and https://accounts.zoho.com/oauth/serverinfo (us, eu, in, au, jp, ca,
 *     sa, uk, sg, ae).
 * China (a Desk host, but no accounts server in either source) and the UK (an
 * accounts server, but no Desk host) are left out.
 *
 * The Desk docs also say the API base is returned as `api_domain` in the token
 * response. The OAuth docs' examples show `api_domain` as
 * `https://api.zoho.com` / `https://www.zohoapis.in`, which is not the Desk
 * host of the table above, so the table is used and `api_domain` is not.
 */
export interface ZohoDeskDataCentre {
  label: string
  /** Accounts server hosting `/oauth/v2/auth` and `/oauth/v2/token`. */
  accountsUrl: string
  /** Desk host; the API lives under `/api/v1`. */
  deskUrl: string
}

export const ZOHO_DESK_DATA_CENTRES: Readonly<Record<string, ZohoDeskDataCentre>> = {
  us: {
    label: 'United States (zoho.com)',
    accountsUrl: 'https://accounts.zoho.com',
    deskUrl: 'https://desk.zoho.com',
  },
  eu: {
    label: 'Europe (zoho.eu)',
    accountsUrl: 'https://accounts.zoho.eu',
    deskUrl: 'https://desk.zoho.eu',
  },
  in: {
    label: 'India (zoho.in)',
    accountsUrl: 'https://accounts.zoho.in',
    deskUrl: 'https://desk.zoho.in',
  },
  au: {
    label: 'Australia (zoho.com.au)',
    accountsUrl: 'https://accounts.zoho.com.au',
    deskUrl: 'https://desk.zoho.com.au',
  },
  jp: {
    label: 'Japan (zoho.jp)',
    accountsUrl: 'https://accounts.zoho.jp',
    deskUrl: 'https://desk.zoho.jp',
  },
  ca: {
    label: 'Canada (zohocloud.ca)',
    accountsUrl: 'https://accounts.zohocloud.ca',
    deskUrl: 'https://desk.zohocloud.ca',
  },
  sa: {
    label: 'Saudi Arabia (zoho.sa)',
    accountsUrl: 'https://accounts.zoho.sa',
    deskUrl: 'https://desk.zoho.sa',
  },
  sg: {
    label: 'Singapore (zoho.sg)',
    accountsUrl: 'https://accounts.zoho.sg',
    deskUrl: 'https://desk.zoho.sg',
  },
  ae: {
    label: 'United Arab Emirates (zoho.ae)',
    accountsUrl: 'https://accounts.zoho.ae',
    deskUrl: 'https://desk.zoho.ae',
  },
}

/** Trim + lowercase a data-centre code and refuse anything outside {@link ZOHO_DESK_DATA_CENTRES}. */
export function normaliseDataCentre(raw: string | undefined | null): string {
  const dc = (raw ?? '').trim().toLowerCase()
  if (!dc) {
    throw new Error(
      'Zoho data centre is required (the Zoho domain you sign in at, e.g. us for zoho.com or eu for zoho.eu).',
    )
  }
  if (!Object.prototype.hasOwnProperty.call(ZOHO_DESK_DATA_CENTRES, dc)) {
    throw new Error(
      `Zoho data centre must be one of: ${Object.keys(ZOHO_DESK_DATA_CENTRES).join(', ')}.`,
    )
  }
  return dc
}

/** "GET {accounts-server-url}/oauth/v2/auth" */
export function zohoAuthorizeUrl(dataCentre: string): string {
  return `${ZOHO_DESK_DATA_CENTRES[normaliseDataCentre(dataCentre)].accountsUrl}/oauth/v2/auth`
}

/** "POST {accounts-server-url}/oauth/v2/token" (code exchange and refresh). */
export function zohoTokenUrl(dataCentre: string): string {
  return `${ZOHO_DESK_DATA_CENTRES[normaliseDataCentre(dataCentre)].accountsUrl}/oauth/v2/token`
}

/** "API Root Endpoint desk.zoho.com/api/v1", on the data centre's Desk host. */
export function zohoDeskApiBase(dataCentre: string): string {
  return `${ZOHO_DESK_DATA_CENTRES[normaliseDataCentre(dataCentre)].deskUrl}/api/v1`
}

/**
 * Read scopes, from the Scopes table and each endpoint's "OAuth Scope" line
 * (https://desk.zoho.com/DeskAPIDocument), joined with commas as the docs
 * show ("scope=Desk.tickets.READ,Desk.basic.READ"):
 *   - Desk.tickets.READ: GET /tickets, /tickets/{id}, /tickets/{id}/conversations
 *   - Desk.search.READ: GET /tickets/search and /contacts/search (the
 *     `updated_after` paths; each lists "Desk.search.READ, Desk.tickets.READ"
 *     or "Desk.search.READ, Desk.contacts.READ")
 *   - Desk.contacts.READ: GET /contacts, /contacts/{id}
 *   - Desk.basic.READ: GET /agents, /teams, /teams/{id},
 *     /accessibleOrganizations ("Grants read access to basic data, such as
 *     organizations, agents and departments"; each endpoint's scope line
 *     lists it).
 *   - Desk.agents.READ: GET /agents/{agent_id}, whose scope line in the
 *     reference names only "Desk.agents.READ".
 */
export const DEFAULT_SCOPES = [
  'Desk.tickets.READ',
  'Desk.search.READ',
  'Desk.contacts.READ',
  'Desk.basic.READ',
  'Desk.agents.READ',
]

/**
 * The shared ceiling of every list this adapter calls: GET /tickets ("limit
 * range : 1-100"), GET /tickets/search and /contacts/search ("range :
 * 1-100"), GET /contacts ("range : 1-100"). GET /agents, /teams and /tickets/{id}/conversations
 * allow up to 200, so 100 is safe on all of them.
 */
export const MAX_PAGE_SIZE = 100

/**
 * GET /tickets/search and /contacts/search: "from ... range : 0-4999 ...
 * starts from 0", and "Each search can return up to 5,000 resources". Rows
 * past this window are unreachable through search. (The published OpenAPI
 * files say a maximum of 999 instead; the reference is followed.)
 */
export const SEARCH_MAX_FROM = 4999

/**
 * Freshchat REST API v2 constants.
 *
 * Stand-alone accounts use a per-account subdomain:
 *   https://<account-name>.freshchat.com/v2
 *
 * The account hostname is stored in credentials.extra.accountDomain at
 * exchange time (e.g. "mycompany.freshchat.com").
 */

export const API_BASE_URL_TEMPLATE = 'https://{accountDomain}/v2'

/** Regional override hostnames when credentials.extra.accountDomain is not set */
export const REGIONAL_HOSTS: Record<string, string> = {
  us: 'api.freshchat.com',
  eu: 'api.eu.freshchat.com',
  in: 'api.in.freshchat.com',
  au: 'api.au.freshchat.com',
}

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

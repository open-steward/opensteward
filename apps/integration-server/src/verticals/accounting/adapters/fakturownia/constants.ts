/**
 * Fakturownia API constants.
 *
 * Each account lives at a customer-chosen subdomain:
 *   https://{account}.fakturownia.pl/
 *
 * Auth: api_token query parameter (obtained from
 * Ustawienia > Ustawienia konta > Integracja > Kod autoryzacyjny API).
 *
 * Docs: https://github.com/fakturownia/api
 */

/** Base URL template — substitute {account} with the customer's subdomain. */
export const FAKTUROWNIA_API_BASE = (account: string) =>
  `https://${account}.fakturownia.pl/`

/** Max results per page (Fakturownia hard-caps at 100). */
export const MAX_PAGE_SIZE = 100

/** Default page size for list requests. */
export const DEFAULT_PAGE_SIZE = 25

/**
 * Belvo — Latin-American open-finance / banking-data aggregator (Brazil,
 * Mexico, Colombia). Belvo is NOT a charge/refund gateway: it exposes a
 * customer's bank Links and the read-only financial data behind them
 * (accounts, balances, transactions, owners, institutions). We surface that
 * data through the closest canonical payments resources — transactions map
 * to charges and balance transactions, owners map to customers.
 *
 * Both environments expose the same REST surface under an `/api` prefix; the
 * merchant picks one at Connect time and the choice rides in
 * `Credentials.extra.environment`.
 *
 * Docs: https://developers.belvo.com/reference/authentication-1
 */
export const HOSTS = {
  sandbox: 'https://sandbox.belvo.com/api',
  production: 'https://api.belvo.com/api',
} as const

export type BelvoEnvironment = keyof typeof HOSTS
export const DEFAULT_ENVIRONMENT: BelvoEnvironment = 'sandbox'

/** Belvo paginates DRF-style: `count` / `next` / `previous` / `results`,
 *  driven by `page` and `page_size` query parameters. */
export const DEFAULT_PAGE_SIZE = 100

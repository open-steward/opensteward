/**
 * BASE (thebase.in) API constants.
 *
 * BASE is a Japan-only, single-currency (JPY) storefront builder
 * (https://thebase.com). Every shop is served from the same global API host
 * — there is no per-shop subdomain — so one registered OAuth2 app (issued
 * after BASE's app-review process) serves every shop that installs it.
 *
 * Docs: https://docs.thebase.in/api/
 */

export const API_BASE_URL = 'https://api.thebase.in/1'
export const AUTHORIZE_URL = `${API_BASE_URL}/oauth/authorize`
export const TOKEN_URL = `${API_BASE_URL}/oauth/token`

/**
 * BASE serves only Japanese shops and its API carries no currency field
 * anywhere (items, orders) — every amount is implicitly JPY.
 */
export const CURRENCY = 'JPY'

/**
 * `GET /1/orders/`: "リミット (任意 デフォルト: 20, MAX: 100)" — the items
 * list documents the same ceiling.
 */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

/**
 * BASE's Apps platform exposes exactly 7 OAuth scopes, confirmed against
 * https://docs.thebase.in/api/ (GET /1/oauth/authorize documents the same
 * set): `read_users`, `read_users_mail`, `read_items`, `read_orders`,
 * `read_savings`, `write_items`, `write_orders`. Defaults below cover
 * everything this adapter implements (items + categories + orders);
 * `read_users` is the authorize endpoint's own documented default and is
 * listed explicitly so it survives an `overrideScopes` call.
 */
export const DEFAULT_SCOPES = ['read_users', 'read_items', 'write_items', 'read_orders', 'write_orders']

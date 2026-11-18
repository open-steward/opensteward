/**
 * ePages Beyond API constants.
 *
 * Beyond is a one-host-per-shop SaaS: every call goes to
 * `https://{shop}.beyondshop.cloud/api/...`, HAL+JSON throughout.
 *
 * Docs: https://developer.epages.com/beyond-docs/ (landing page) which links
 * to the generated reference at https://api-docs.beyondshop.cloud/ — the
 * pages actually cited by this adapter are:
 *   - https://api-docs.beyondshop.cloud/ng-auth-auth-public-api.html
 *   - https://api-docs.beyondshop.cloud/ng-product-management-product-management-public-api.html
 *   - https://api-docs.beyondshop.cloud/ng-order-order-public-api.html
 *   - https://api-docs.beyondshop.cloud/ng-customer-customer-public-api.html
 *   - https://api-docs.beyondshop.cloud/ng-webhook-webhook-public-api.html
 *   - https://api-docs.beyondshop.cloud/index-api-basics.html#pagination
 */

/** Only real Beyond shop hosts — confines the Connect form input. */
export const SHOP_HOST_SUFFIX = 'beyondshop.cloud'

/**
 * Pagination (https://api-docs.beyondshop.cloud/index-api-basics.html#pagination):
 * `page` is 0-indexed, `size` defaults to 20. Beyond does not publish a hard
 * ceiling on `size`; we clamp defensively so one runaway sync request can't
 * ask for an unbounded page.
 */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 200

/**
 * OAuth2 grant types accepted by `POST /api/oauth/token`
 * (ng-auth-auth-public-api.html#resources-tokens-client). This adapter only
 * ever uses `client_credentials` — the custom (private) app flow — per the
 * task: store-listed `authorization_code` apps need ePages review and are
 * out of scope.
 */
export const GRANT_CLIENT_CREDENTIALS = 'client_credentials'

/**
 * Beyond does not publish `expires_in` guidance beyond "seconds since iat" —
 * observed example responses show short-lived (order of minutes) JWTs with
 * no refresh_token for the client_credentials grant, so this adapter always
 * re-authenticates rather than tracking a refresh token. Refresh 60s before
 * the token's reported expiry.
 */
export const TOKEN_REFRESH_BUFFER_MS = 60_000

/**
 * Webhook event types this adapter subscribes to when `registerWebhook` is
 * called (ng-webhook-webhook-public-api.html — "Webhook subscriptions").
 * `shop.updated` / `shop.deleted` / `app.uninstalled` / `app.deleted` exist
 * too but carry no canonical resource to map onto, so they are omitted.
 */
export const DEFAULT_WEBHOOK_EVENT_TYPES = [
  'order.created',
  'order.updated',
  'product.created',
  'product.updated',
  'product.deleted',
]

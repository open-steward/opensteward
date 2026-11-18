// The API bases, the two IdentityServer environments and the application name
// are ShipBob's, not this adapter's: `inventory/shipbob-inventory` authorizes
// against the same ones. They are defined once in the kernel project and
// re-exported here so this adapter's imports (and the tests that assert
// against them) keep reading from one place.
export {
  SHIPBOB_API_BASE,
  SHIPBOB_SANDBOX_API_BASE,
  SHIPBOB_AUTH_URL,
  SHIPBOB_TOKEN_URL,
  SHIPBOB_SANDBOX_AUTH_URL,
  SHIPBOB_SANDBOX_TOKEN_URL,
  DEFAULT_APP_NAME,
} from '../../../shared/shipbob-oauth'

// Dashboard for PAT token generation
export const SHIPBOB_DASHBOARD_URL = 'https://app.shipbob.com/integrations'

// Default scopes for OAuth2
export const DEFAULT_SCOPES = [
  'orders_read',
  'orders_write',
  'fulfillments_read',
  'inventory_read',
  'products_read',
  'receiving_read',
  'channels_read',
  'webhooks_read',
  'webhooks_write',
  'offline_access',
]

// Rate limits: ShipBob uses 429 backoff
export const RATE_LIMIT_RPS = 60
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 250

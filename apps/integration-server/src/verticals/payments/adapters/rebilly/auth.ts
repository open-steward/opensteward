import type { Credentials } from '@opensteward/shared'
import { LIVE_ORIGIN, SANDBOX_ORIGIN, SANDBOX_SECRET_KEY_PREFIX } from './constants'

/**
 * Rebilly authenticates with a secret API key in the `REB-APIKEY` header
 * (openapi.yaml `SecretApiKey`: "name: REB-APIKEY, type: apiKey, in: header")
 * against an organization-scoped base URL: "When interacting with the Rebilly
 * API, you use your organization ID and secret key to authenticate requests."
 * (https://www.rebilly.com/docs/dev-docs/api-keys)
 */
function missingOrganization(): Error {
  return Object.assign(
    new Error(
      'Rebilly needs the organization ID ("Both IDs are required to interact with the Rebilly ' +
        'API"); reconnect this connection with organizationId and a secret API key.',
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = fields.apiKey?.trim() ?? ''
  const organizationId = fields.organizationId?.trim() ?? ''
  if (apiKey === '' || organizationId === '') throw missingOrganization()
  return { accessToken: apiKey, extra: { organizationId } }
}

/** The organization ID stored at connect time; refuses a connection without one. */
export function organizationIdOf(credentials: Credentials): string {
  const id = credentials.extra?.organizationId
  if (typeof id !== 'string' || id.trim() === '' || !credentials.accessToken) {
    throw missingOrganization()
  }
  return id.trim()
}

/**
 * `https://api[-sandbox].rebilly.com/organizations/{organizationId}`. The host
 * follows the key's documented environment segment; any other key is live.
 */
export function apiBaseUrl(credentials: Credentials): string {
  const organizationId = organizationIdOf(credentials)
  const origin = credentials.accessToken.startsWith(SANDBOX_SECRET_KEY_PREFIX)
    ? SANDBOX_ORIGIN
    : LIVE_ORIGIN
  return `${origin}/organizations/${encodeURIComponent(organizationId)}`
}

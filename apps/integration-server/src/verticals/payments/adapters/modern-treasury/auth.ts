import type { Credentials } from '@opensteward/shared'

/**
 * Modern Treasury uses HTTP basic auth: "Authentication requires a `username`
 * and a `password`" where `username` is the "Organization ID" and `password`
 * the "Production or Sandbox API Key"; the example request is
 * `curl --request GET -u ORGANIZATION_ID:API_KEY`
 * (https://docs.moderntreasury.com/platform/reference/authentication.md).
 */
function incomplete(): Error {
  return Object.assign(
    new Error(
      'Modern Treasury needs both the Organization ID and the API key; reconnect this ' +
        'connection with both.',
    ),
    { statusCode: 401, code: 'CREDENTIALS_INCOMPLETE' },
  )
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = fields.apiKey?.trim() ?? ''
  const organizationId = fields.organizationId?.trim() ?? ''
  if (apiKey === '' || organizationId === '') throw incomplete()
  return { accessToken: apiKey, extra: { organizationId } }
}

/** The Organization ID stored at connect time; refuses a connection without one. */
export function organizationIdOf(credentials: Credentials): string {
  const id = credentials.extra?.organizationId
  if (typeof id !== 'string' || id === '' || !credentials.accessToken) throw incomplete()
  return id
}

/** `Authorization: Basic base64(ORGANIZATION_ID:API_KEY)`. */
export function basicAuthHeader(credentials: Credentials): string {
  const organizationId = organizationIdOf(credentials)
  return `Basic ${Buffer.from(`${organizationId}:${credentials.accessToken}`).toString('base64')}`
}

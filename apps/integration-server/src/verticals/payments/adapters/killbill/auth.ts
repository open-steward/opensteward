import type { Credentials } from '@opensteward/shared'

/**
 * Kill Bill auth (https://killbill.github.io/slate/, "Authentication and RBAC"
 * and "Multi-Tenancy"):
 *
 *   "one needs to authenticate each request by passing an HTTP Authorization
 *    header and by following the HTTP Basic authentication scheme"
 *   "Each API call requires the tenant being used to be identified, through
 *    the use of 2 HTTP headers: X-Killbill-ApiKey ... X-Killbill-ApiSecret"
 *
 * Kill Bill is self-hosted (the docs' only host, http://127.0.0.1:8080, is a
 * local install), so the server URL comes from the connection. The Basic
 * token is kept as `accessToken`; the server URL and tenant key/secret live on
 * `extra`.
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  const serverUrl = (fields.serverUrl ?? '').trim().replace(/\/+$/, '')
  const username = fields.username ?? ''
  const password = fields.password ?? ''
  const apiKey = (fields.apiKey ?? '').trim()
  const apiSecret = fields.apiSecret ?? ''
  const missing = Object.entries({ serverUrl, username, password, apiKey, apiSecret })
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length > 0) {
    throw Object.assign(new Error(`Kill Bill connection is missing: ${missing.join(', ')}`), {
      statusCode: 400,
    })
  }
  return {
    accessToken: Buffer.from(`${username}:${password}`).toString('base64'),
    extra: { serverUrl, apiKey, apiSecret },
  }
}

export interface KillbillConnection {
  serverUrl: string
  apiKey: string
  apiSecret: string
}

/** The server URL and tenant headers a connection carries; throws for connections made before they were collected. */
export function resolveConnection(credentials: Credentials): KillbillConnection {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const serverUrl = typeof extra['serverUrl'] === 'string' ? extra['serverUrl'] : ''
  const apiKey = typeof extra['apiKey'] === 'string' ? extra['apiKey'] : ''
  const apiSecret = typeof extra['apiSecret'] === 'string' ? extra['apiSecret'] : ''
  if (!serverUrl || !apiKey || !apiSecret) {
    throw Object.assign(
      new Error(
        'Kill Bill connection has no server URL or tenant API key/secret; reconnect with serverUrl, username, password, apiKey and apiSecret',
      ),
      { statusCode: 401 },
    )
  }
  return { serverUrl: serverUrl.replace(/\/+$/, ''), apiKey, apiSecret }
}

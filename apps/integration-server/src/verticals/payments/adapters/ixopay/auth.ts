/**
 * IXOPAY authentication — HTTP Basic Auth + per-request HMAC-SHA512 signing.
 *
 * IXOPAY v3 API authenticates every request with TWO complementary mechanisms:
 *
 *   1. Authorization: Basic {base64(username:password)}
 *      The API username and password are taken from the IXOPAY dashboard →
 *      Settings → API Users. These are encoded together as Basic auth.
 *
 *   2. X-Signature: {base64(HMAC-SHA512(message, sharedSecret))}
 *      An additional per-request HMAC signature computed over
 *      METHOD + SHA512_HEX(body) + Content-Type + Date + RequestURI
 *      (see `client.ts`). The HMAC key is the connector shared secret from
 *      the IXOPAY dashboard → Settings → Connectors → API credentials.
 *
 * The connector API key is NOT sent in the Authorization header — it appears
 * only in the URL path (e.g. `/transaction/{apiKey}/debit`).
 *
 * A test connector and a live connector each issue their own credentials, so
 * there is no separate environment toggle: pointing the connection at a test
 * connector's credentials is what makes it a sandbox connection.
 *
 * Docs: https://documentation.ixopay.com/docs/guides/production/additional-security
 *       https://gateway.ixopay.com/Schema/V3/OpenApiSpecification.yml
 */
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'

/** The connector API key (public; appears in URL paths). */
export function apiKey(credentials: Credentials): string {
  return credentials.accessToken
}

/** The API username for Basic auth. */
export function apiUsername(credentials: Credentials): string {
  const value = credentials.extra?.['apiUsername']
  return typeof value === 'string' ? value : ''
}

/** The API password for Basic auth. */
export function apiPassword(credentials: Credentials): string {
  const value = credentials.extra?.['apiPassword']
  return typeof value === 'string' ? value : ''
}

/** The connector shared secret — used as the HMAC key when signing requests (X-Signature). */
export function sharedSecret(credentials: Credentials): string {
  const value = credentials.extra?.['sharedSecret']
  return typeof value === 'string' ? value : ''
}

/**
 * Connect-form descriptor + exchange. IXOPAY requires the connector API key
 * (for URL paths), an API username + password (Basic auth), and a shared
 * secret (HMAC signing key for X-Signature).
 */
export const FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'Connector API key',
      type: 'text',
      required: true,
      helpText:
        'Your IXOPAY connector API key, from the IXOPAY dashboard → Settings → Connectors → API. Used in URL paths.',
    },
    {
      name: 'apiUsername',
      label: 'API username',
      type: 'text',
      required: true,
      helpText:
        'Your IXOPAY API username, from the IXOPAY dashboard → Settings → API Users. Used for HTTP Basic authentication.',
    },
    {
      name: 'apiPassword',
      label: 'API password',
      type: 'password',
      required: true,
      helpText:
        'Your IXOPAY API password. Used together with the API username for HTTP Basic authentication.',
    },
    {
      name: 'sharedSecret',
      label: 'Shared secret',
      type: 'password',
      required: true,
      helpText:
        'Your IXOPAY connector shared secret. Used to compute the X-Signature HMAC-SHA512 header on every request; never leaves the server.',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const key = (fields['apiKey'] ?? '').trim()
    const username = (fields['apiUsername'] ?? '').trim()
    const password = (fields['apiPassword'] ?? '').trim()
    const secret = (fields['sharedSecret'] ?? '').trim()
    if (!key) throw new Error('Connector API key is required.')
    if (!username) throw new Error('API username is required.')
    if (!password) throw new Error('API password is required.')
    if (!secret) throw new Error('Shared secret is required.')
    return { accessToken: key, extra: { apiUsername: username, apiPassword: password, sharedSecret: secret } }
  },
})

import type { Credentials } from '../../adapter/interface'
import { VERACORE_API_BASE_TEMPLATE, TOKEN_REFRESH_BUFFER_MS, VERACORE_LOGIN_PATH } from './constants'

/**
 * VeraCore API credentials config.
 *
 * Authentication is a two-step flow:
 *   1. POST {baseUrl}/login with { userName, password, systemId }
 *      → receives { Token, UtcExpirationDate }
 *   2. All subsequent requests send: Authorization: Bearer {Token}
 *
 * The `domain` is the full customer hostname, e.g. "acme.veracore.com".
 */
export interface VeraCoreAuthConfig {
  username: string
  password: string
  systemId: string
  domain: string
}

/**
 * Build the per-customer base URL from the customer domain.
 * domain should be the full hostname, e.g. "acme.veracore.com"
 */
export function buildBaseUrl(domain: string): string {
  return VERACORE_API_BASE_TEMPLATE.replace('{domain}', domain)
}

/**
 * Response shape from POST /api/login.
 */
interface VeraCoreLoginResponse {
  Token?: string | null
  UtcExpirationDate?: string | null
  Error?: string | null
}

/**
 * Perform the two-step VeraCore token exchange.
 * POSTs username/password/systemId to the login endpoint and
 * stores the returned Bearer token + expiry in the Credentials object.
 */
export async function exchangeCredentials(config: VeraCoreAuthConfig): Promise<Credentials> {
  const baseUrl = buildBaseUrl(config.domain)
  const loginUrl = `${baseUrl}/${VERACORE_LOGIN_PATH}`

  const res = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      userName: config.username,
      password: config.password,
      systemId: config.systemId,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`VeraCore login failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as VeraCoreLoginResponse

  if (!json.Token) {
    throw new Error(`VeraCore login succeeded but returned no Token: ${JSON.stringify(json)}`)
  }

  const expiresAt = json.UtcExpirationDate
    ? new Date(json.UtcExpirationDate)
    : undefined

  return {
    accessToken: json.Token,
    expiresAt,
    extra: {
      username: config.username,
      password: config.password,
      systemId: config.systemId,
      domain: config.domain,
    },
  }
}

/**
 * Refresh VeraCore credentials by re-running the token exchange
 * using the username/password/systemId stored in credentials.extra.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const username = extra.username as string | undefined
  const password = extra.password as string | undefined
  const systemId = extra.systemId as string | undefined
  const domain = extra.domain as string | undefined

  if (!username || !password || !systemId || !domain) {
    throw new Error(
      'Cannot refresh VeraCore credentials: missing username/password/systemId/domain in extra',
    )
  }

  return exchangeCredentials({ username, password, systemId, domain })
}

/**
 * Returns true when the Bearer token is missing or within the refresh buffer window.
 */
export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

/**
 * Build the Authorization header value for authenticated API requests.
 */
export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}

/**
 * Extract the customer domain from stored credentials.extra.
 */
export function getDomain(credentials: Credentials): string {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  return (extra.domain as string | undefined) ?? 'api.veracore.com'
}

export { TOKEN_REFRESH_BUFFER_MS }

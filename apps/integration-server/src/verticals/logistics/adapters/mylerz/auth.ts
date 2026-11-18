import type { Credentials } from '../../adapter/interface'
import { MYLERZ_DASHBOARD_URL, MYLERZ_TOKEN_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return MYLERZ_DASHBOARD_URL
}

/** A bearer token the caller already obtained from the token endpoint. */
export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

interface MylerzTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

/**
 * The password grant the official Mylerz WooCommerce plugin runs
 * (includes/mylerz-helpers.php, mylerzRequestNewToken):
 *
 *   'Content-Type' => 'application/x-www-form-urlencoded',
 *   'body' => array('username' => $userName, 'password' => $password, 'grant_type' => 'password'),
 *   ...
 *   if (!empty($result['access_token'])) { ... 'Token' => $result['access_token'] }
 *
 * The username and password stay on `extra` so a refresh can run the grant
 * again: the plugin, too, requests a new token from the stored pair when the
 * old one is refused (includes/mylerz-ajax.php).
 */
export async function requestToken(
  username: string,
  password: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Credentials> {
  const res = await fetchImpl(MYLERZ_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ username, password, grant_type: 'password' }).toString(),
  })
  const json = (await res.json().catch(() => ({}))) as MylerzTokenResponse
  if (!res.ok || !json.access_token) {
    const reason = json.error_description ?? json.error ?? `HTTP ${res.status}`
    throw new Error(`Mylerz token request failed: ${reason}`)
  }
  return { accessToken: json.access_token, extra: { username, password } }
}

/** The username and password `requestToken` stored on `extra`, if this connection has them. */
export function storedLogin(
  credentials: Credentials,
): { username: string; password: string } | null {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const username = extra['username']
  const password = extra['password']
  if (typeof username !== 'string' || typeof password !== 'string') return null
  return { username, password }
}

/**
 * Runs the password grant again from the stored pair. A connection made before
 * the pair was stored has nothing to re-grant from and comes back unchanged;
 * it must reconnect. Nothing in shared calls this on a schedule (the token
 * response carries no expiry), so MylerzClient also re-grants on a 401.
 */
export async function refreshCredentials(
  credentials: Credentials,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Credentials> {
  const login = storedLogin(credentials)
  if (!login) return credentials
  return requestToken(login.username, login.password, fetchImpl)
}

import type { Credentials } from '../../adapter/interface'
import { DELIVERECT_DASHBOARD_URL } from './constants'

/**
 * Deliverect uses OAuth 2.0 Client Credentials (machine-to-machine).
 * There is no user-facing auth URL — we return the developer portal so the
 * operator can locate their credentials, and the actual token exchange is
 * performed by the client on every request (with caching).
 *
 * The "code" passed to exchangeCode is expected to be a JSON string of the form:
 *   {"clientId":"...","clientSecret":"...","accountId":"..."}
 * where accountId is the Deliverect account/channel-link identifier.
 */
export function buildAuthUrl(_state: string): string {
  return DELIVERECT_DASHBOARD_URL
}

export async function exchangeCode(code: string, _redirectUri?: string): Promise<Credentials> {
  let parsed: Record<string, string>
  try {
    parsed = JSON.parse(code) as Record<string, string>
  } catch {
    // Support plain colon-delimited format: clientId:clientSecret:accountId
    const parts = code.split(':')
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      throw new Error(
        'Deliverect credentials must be a JSON string {"clientId":"...","clientSecret":"...","accountId":"..."} ' +
          'or a colon-delimited string "<clientId>:<clientSecret>[:<accountId>]"',
      )
    }
    parsed = { clientId: parts[0], clientSecret: parts[1], accountId: parts[2] ?? '' }
  }

  const { clientId, clientSecret, accountId } = parsed
  if (!clientId || !clientSecret) {
    throw new Error('Deliverect credentials require clientId and clientSecret')
  }

  return {
    // accessToken is intentionally blank — the client fetches it at request-time
    accessToken: '',
    extra: { clientId, clientSecret, accountId: accountId ?? '' },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Token lifecycle is managed in the client; nothing to rotate here
  return credentials
}

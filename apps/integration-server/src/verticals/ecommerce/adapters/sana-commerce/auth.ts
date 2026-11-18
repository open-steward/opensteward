/**
 * Sana Commerce authentication helpers.
 *
 * Sana Commerce does NOT use OAuth2's authorization-code flow. Instead,
 * the web service uses a ticket-based session scheme:
 *
 *  1. Call `PUT {siteUrl}/api/CommerceService.svc/customer/login` with a
 *     JSON body containing `UserName` and `Password`.
 *  2. The response returns an encrypted `Ticket` string.
 *  3. That ticket is sent on all subsequent requests as the `Ticket` HTTP
 *     header (max 255 chars).
 *
 * For OpenSteward's api_key model the caller stores:
 *  - `credentials.accessToken`  — the API password (used to obtain a ticket)
 *  - `credentials.extra.siteUrl` — the storefront base URL (e.g. `https://store.example.com`)
 *  - `credentials.extra.username` — the API / service account username
 *
 * The client obtains a fresh ticket at construction time before making
 * any data requests.
 *
 * Docs:
 *  https://help.sana-commerce.com/sana-commerce-90/how_tos/web-service-developer-guide/authentication-and-security
 *  https://help.sana-commerce.com/sana-commerce-83/how_tos/web-service-developer-guide/general-behaviour-and-http-headers
 */

import type { Credentials } from '@opensteward/shared'
import { WS_PATH } from './constants'

export interface LoginResponse {
  Ticket?: string
  ticket?: string
  ErrorCode?: number | null
  ErrorMessage?: string | null
}

/**
 * Obtain a session ticket from the Sana Commerce web service.
 *
 * Throws if the login request fails or the response does not contain a
 * ticket — callers must not proceed without a valid ticket.
 */
export async function obtainTicket(
  siteUrl: string,
  username: string,
  password: string,
): Promise<string> {
  const url = `${siteUrl.replace(/\/$/, '')}${WS_PATH}/customer/login`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ UserName: username, Password: password }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `Sana Commerce login failed: HTTP ${res.status} from ${url}: ${text}`,
    )
  }

  const json = (await res.json()) as LoginResponse
  const ticket = json.Ticket ?? json.ticket
  if (!ticket) {
    throw new Error(
      `Sana Commerce login returned no ticket — check credentials (ErrorMessage: ${json.ErrorMessage ?? 'none'})`,
    )
  }
  return ticket
}

/**
 * Informational URL pointing the user at the Sana admin page where API
 * credentials (service account + password) are managed. No real OAuth
 * authorize URL exists.
 */
export function buildAuthUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}/Sana/Admin`
}

/**
 * `exchangeCode` throws with clear instructions. Sana Commerce does not
 * use the OAuth code-exchange flow — credentials are supplied directly via
 * the Connect Link form.
 */
export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Sana Commerce does not use OAuth code exchange. ' +
      'Supply credentials as {accessToken: password, extra: {siteUrl, username}} ' +
      'via the Connect Link form or POST /v1/connections.',
  )
}

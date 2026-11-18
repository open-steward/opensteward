/**
 * Qontak CRM HTTP client — Mekari HMAC request signing.
 *
 * Qontak's CRM OpenAPI ("B. Authorization", "I. Request Headers"):
 *
 *   Authorization     hmac username="CLIENT_ID", algorithm="hmac-sha256",
 *                     headers="date request-line", signature="…"
 *   Date              current time (`new Date().toUTCString()`)
 *   X-Crm-User-Sso-Id sso_id of user that want to do action.
 *
 * and "II. HMAC Creation":
 *
 *   const fullPath = path + (queryParams ? '?' + queryParams : '');
 *   const requestLine = `${method} ${fullPath} HTTP/1.1`;
 *   const payload = `date: ${datetime}\n${requestLine}`;
 *   const digest = CryptoJS.HmacSHA256(payload, clientSecret);
 *   const signature = CryptoJS.enc.Base64.stringify(digest);
 *
 * Docs: https://raw.githubusercontent.com/qontak-dev/docs/master/Qontak-CRM-OpenAPI-MAG.json
 */
import { createHmac } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

/** The three values the HMAC scheme needs, as stored by the credential form. */
export interface QontakHmacCredentials {
  clientId: string
  clientSecret: string
  ssoId: string
}

/**
 * Read the HMAC credentials off a connection. A connection made before the
 * move to HMAC (an OAuth access token only) carries none of them and has to
 * reconnect; it gets a 401 naming what is missing rather than a request
 * signed with an empty secret.
 */
export function readHmacCredentials(credentials: Credentials): QontakHmacCredentials {
  const extra = credentials.extra ?? {}
  const clientId = typeof extra['clientId'] === 'string' ? extra['clientId'] : ''
  const clientSecret = typeof extra['clientSecret'] === 'string' ? extra['clientSecret'] : ''
  const ssoId = typeof extra['ssoId'] === 'string' ? extra['ssoId'] : ''
  const missing = [
    !clientId && 'HMAC username (client id)',
    !clientSecret && 'HMAC secret',
    !ssoId && 'user SSO id (X-Crm-User-Sso-Id)',
  ].filter(Boolean)
  if (missing.length > 0) {
    throw Object.assign(
      new Error(
        `Qontak connection is missing its ${missing.join(', ')}. Qontak's CRM API signs every ` +
          'request with Mekari HMAC credentials; reconnect with the HMAC username, secret and user SSO id.',
      ),
      { statusCode: 401, code: 'UNAUTHORIZED' },
    )
  }
  return { clientId, clientSecret, ssoId }
}

/** The documented `Authorization` value for one request. */
export function signRequest(
  creds: Pick<QontakHmacCredentials, 'clientId' | 'clientSecret'>,
  method: string,
  pathWithQuery: string,
  date: string,
): string {
  const requestLine = `${method} ${pathWithQuery} HTTP/1.1`
  const payload = `date: ${date}\n${requestLine}`
  const signature = createHmac('sha256', creds.clientSecret).update(payload).digest('base64')
  return (
    `hmac username="${creds.clientId}", algorithm="hmac-sha256", ` +
    `headers="date request-line", signature="${signature}"`
  )
}

export class QontakClient {
  private readonly creds: QontakHmacCredentials

  constructor(credentials: Credentials) {
    this.creds = readHmacCredentials(credentials)
  }

  private async request<T>(
    method: string,
    path: string,
    query?: Record<string, string | number>,
    body?: unknown,
  ): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`)
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v))
    const date = new Date().toUTCString()
    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: signRequest(this.creds, method, `${url.pathname}${url.search}`, date),
        Date: date,
        'X-Crm-User-Sso-Id': this.creds.ssoId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body != null ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Qontak API error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }

    if (res.status === 204) return undefined as unknown as T
    return res.json() as Promise<T>
  }

  async get<T>(path: string, query?: Record<string, string | number>): Promise<T> {
    return this.request<T>('GET', path, query)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', path)
  }
}

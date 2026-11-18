import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

/**
 * Raynet auth, verbatim from the docs' "Connection to RAYNET CRM" section:
 * "Access is secured with basic authentication (username and API key) or a
 * bearer token in the `Authorization: Bearer TOKEN` header ... When using
 * basic authentication, you must also send your instance name (header
 * `X-Instance-Name`) or its ID (header `X-Instance-Id`)."
 *
 * The connection stores the API key in `accessToken` and the username and
 * instance name in `extra`. Connections made before this shape stored only
 * the key, and cannot authenticate: they are refused here, before any
 * request, and must reconnect.
 */

/** The documented list envelope: `{ success, totalCount, data }`. */
export interface RaynetListResponse<T> {
  success?: string | boolean
  totalCount?: number
  data?: T[]
}

/** The documented detail envelope: `{ success, data }`. */
export interface RaynetDetailResponse<T> {
  success?: string | boolean
  data?: T
}

interface Auth {
  authorization: string
  instanceName: string
}

function readAuth(credentials: Credentials): Auth {
  const username = credentials.extra?.['username']
  const instanceName = credentials.extra?.['instanceName']
  const apiKey = credentials.accessToken
  if (
    typeof username !== 'string' ||
    !username ||
    typeof instanceName !== 'string' ||
    !instanceName ||
    !apiKey
  ) {
    throw Object.assign(
      new Error(
        'Raynet needs a username, an API key and an instance name (basic auth plus the ' +
          'X-Instance-Name header). Reconnect this connection to supply all three.',
      ),
      { statusCode: 401, code: 'RECONNECT_REQUIRED' },
    )
  }
  const basic = Buffer.from(`${username}:${apiKey}`).toString('base64')
  return { authorization: `Basic ${basic}`, instanceName }
}

async function request<T>(
  method: string,
  path: string,
  auth: Auth,
  params?: Record<string, string | number>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: auth.authorization,
      'X-Instance-Name': auth.instanceName,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Raynet API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class RaynetClient {
  private credentials: Credentials

  constructor(credentials: Credentials) {
    this.credentials = credentials
  }

  async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    return request<T>('GET', path, readAuth(this.credentials), params)
  }

  /** One page (or, for a picklist, the whole list) with the documented total. */
  async list<T>(
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<{ items: T[]; totalCount: number | undefined }> {
    const res = await this.get<RaynetListResponse<T>>(path, params)
    return {
      items: Array.isArray(res?.data) ? res.data : [],
      totalCount: typeof res?.totalCount === 'number' ? res.totalCount : undefined,
    }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, readAuth(this.credentials), undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, readAuth(this.credentials), undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, readAuth(this.credentials))
  }
}

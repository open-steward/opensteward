import type { Credentials } from '@opensteward/shared'
import { BASE_URL, INTEGRATION_NAME, INTEGRATION_PROVIDER } from './constants'

/**
 * The envelope every documented cobra response shares, e.g.
 * `PeopleListListCobraApiResponse` / `TokenResponseCobraApiResponse`:
 * `data`, `message`, `metaData` (`totalResults`, `responseTimeStamp`) and
 * `statusCode` (https://apis.cobra-hilfe.de/api-7858747.md).
 */
export interface CobraApiResponse<T> {
  data?: T | null
  message?: string | null
  metaData?: { totalResults?: number; responseTimeStamp?: string } | null
  statusCode?: number
}

/**
 * The tenant a connection talks to. "To access data of a specific Tenant
 * through our APIs, it is essential to include the `X-Cobra-TenantId` header
 * in every request." (https://apis.cobra-hilfe.de/doc-386342.md)
 */
export function cobraTenantId(credentials: Credentials): string {
  const value = credentials.extra?.['cobraTenantId']
  if (typeof value !== 'string' || value.trim() === '') {
    throw Object.assign(
      new Error(
        'cobra CRM: this connection has no tenant id (credentials.extra.cobraTenantId). ' +
          'Every cobra request needs the X-Cobra-TenantId header; reconnect with your email, API key and tenant id.',
      ),
      { statusCode: 401 },
    )
  }
  return value.trim()
}

/** The three headers cobra requires on every request (doc-431461). */
export function integrationHeaders(tenantId: string): Record<string, string> {
  return {
    'X-Integration-Name': INTEGRATION_NAME,
    'X-Integration-Provider': INTEGRATION_PROVIDER,
    'X-Cobra-TenantId': tenantId,
  }
}

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  body?: unknown,
): Promise<T> {
  const tenantId = cobraTenantId(credentials)
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...integrationHeaders(tenantId),
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`cobra CRM API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class CobraCrmClient {
  constructor(private credentials: Credentials) {}

  /** A documented GET, returning the whole `CobraApiResponse` envelope. */
  async getEnvelope<T>(path: string): Promise<CobraApiResponse<T>> {
    return request<CobraApiResponse<T>>('GET', path, this.credentials)
  }

  /** A documented GET by id: the envelope's `data`, or an error when it has none. */
  async getData<T>(path: string): Promise<T> {
    const res = await this.getEnvelope<T>(path)
    if (res.data == null) {
      throw Object.assign(new Error(`cobra CRM: GET ${path} returned no data`), { statusCode: 404 })
    }
    return res.data
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.credentials, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.credentials, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.credentials)
  }
}

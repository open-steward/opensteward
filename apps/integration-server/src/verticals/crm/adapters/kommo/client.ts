import type { Credentials } from '@opensteward/shared'

/**
 * KommoClient — thin HTTP wrapper around the Kommo REST API v4.
 *
 * Base URL is account-specific: https://{subdomain}.kommo.com/api/v4
 * All responses wrap resources under `_embedded`.
 */

function baseUrl(credentials: Credentials): string {
  const subdomain = (credentials.extra?.['subdomain'] as string | undefined) ?? ''
  if (!subdomain) throw new Error('Kommo: credentials.extra.subdomain is required')
  return `https://${subdomain}.kommo.com/api/v4`
}

async function request<T>(
  method: string,
  url: string,
  credentials: Credentials,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return undefined as T

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Kommo API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  return res.json() as Promise<T>
}

export class KommoClient {
  constructor(private credentials: Credentials) {}

  private base(): string {
    return baseUrl(this.credentials)
  }

  async list<T>(
    path: string,
    embeddedKey: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const url = new URL(`${this.base()}${path}`)
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }

    const res = await request<KommoEnvelopeResponse<Record<string, T[]>>>(
      'GET',
      url.toString(),
      this.credentials,
    )

    // Kommo returns 204/empty when there are no items
    if (!res || !res._embedded) return { items: [], hasMore: false }

    const items = (res._embedded[embeddedKey] as T[] | undefined) ?? []
    const hasMore = !!res._links?.next
    return { items, hasMore }
  }

  async get<T>(path: string): Promise<T> {
    const url = `${this.base()}${path}`
    return request<T>('GET', url, this.credentials)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.base()}${path}`
    return request<T>('POST', url, this.credentials, body)
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.base()}${path}`
    return request<T>('PATCH', url, this.credentials, body)
  }

  async delete(path: string): Promise<void> {
    const url = `${this.base()}${path}`
    await request<void>('DELETE', url, this.credentials)
  }
}

interface KommoEnvelopeResponse<E> {
  _embedded?: E
  _links?: {
    next?: { href: string }
  }
}

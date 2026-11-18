/**
 * HTTP client for the CentralStationCRM REST API.
 *
 * Auth: X-apikey header.
 * The account name is embedded in the base URL so the client is
 * instantiated per-request with resolved credentials.
 */

import type { Credentials } from '@opensteward/shared'
import { buildBaseUrl } from './constants'

function getAccount(credentials: Credentials): string {
  return ((credentials.extra as Record<string, unknown> | undefined)?.['accountName'] as string | undefined) ?? ''
}

function getApiKey(credentials: Credentials): string {
  return credentials.accessToken
}

async function request<T>(
  method: string,
  baseUrl: string,
  path: string,
  apiKey: string,
  params?: Record<string, string | number | undefined>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${baseUrl}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v))
      }
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'X-apikey': apiKey,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`CentralStationCRM API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  // 204 No Content (DELETE)
  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class CentralStationCrmClient {
  private baseUrl: string
  private apiKey: string

  constructor(credentials: Credentials) {
    const account = getAccount(credentials)
    this.baseUrl = buildBaseUrl(account)
    this.apiKey = getApiKey(credentials)
  }

  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    return request<T>('GET', this.baseUrl, path, this.apiKey, params)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', this.baseUrl, path, this.apiKey, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', this.baseUrl, path, this.apiKey, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', this.baseUrl, path, this.apiKey)
  }

  /** Paginated GET — returns raw items array. */
  async list<T>(path: string, page: number, perpage: number): Promise<T[]> {
    return this.get<T[]>(path, { page, perpage })
  }
}

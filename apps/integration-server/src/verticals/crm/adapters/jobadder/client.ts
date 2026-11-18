/**
 * Thin HTTP client for the JobAdder REST API v2.
 *
 * Base URL: https://api.jobadder.com/v2
 * Auth:     Bearer {access_token} in Authorization header.
 * Pagination: offset-based — query params `Offset` (int) and `Limit` (int, max 1000).
 *             List responses return { items: T[], totalCount: number, links: {...} }.
 */

import type { Credentials } from '@opensteward/shared'
import { JOBADDER_BASE_URL } from './constants'

/** Standard JobAdder list-response envelope. */
export interface JobAdderListResponse<T> {
  items: T[]
  totalCount?: number
  links?: {
    next?: string
    first?: string
    [key: string]: string | undefined
  }
}

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${JOBADDER_BASE_URL}${path}`)
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
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`JobAdder API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  // 204 No Content on DELETE / some PUT responses
  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class JobAdderClient {
  constructor(private credentials: Credentials) {}

  /**
   * One page of a list. Returns the items array from the JobAdder envelope,
   * the envelope's `totalCount`, and whether it carried a `links.next`
   * (`undefined` when the envelope has no `links` at all).
   *
   * The caller sends the page itself (`Offset`/`Limit`); nothing is added
   * here, so a request never carries two spellings of the page size.
   */
  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; totalCount?: number; hasNext?: boolean }> {
    const res = await request<JobAdderListResponse<T>>('GET', path, this.credentials, params)
    return {
      items: res.items ?? [],
      totalCount: typeof res.totalCount === 'number' ? res.totalCount : undefined,
      hasNext: res.links ? !!res.links.next : undefined,
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.credentials, params)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.credentials, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.credentials, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.credentials)
  }
}

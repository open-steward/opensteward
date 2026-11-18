import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

function apiKeyFrom(credentials: Credentials): string {
  return credentials.accessToken
}

function emailFrom(credentials: Credentials): string {
  return String(credentials.extra?.['email'] ?? '')
}

function authHeaders(credentials: Credentials): Record<string, string> {
  return {
    'X-PW-AccessToken': apiKeyFrom(credentials),
    'X-PW-UserEmail': emailFrom(credentials),
    'X-PW-Application': 'developer_api',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  body?: unknown,
): Promise<T> {
  const url = `${BASE_URL}${path}`

  const res = await fetch(url, {
    method,
    headers: authHeaders(credentials),
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Copper API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  // DELETE returns 200 with empty body sometimes
  const text = await res.text()
  if (!text) return undefined as unknown as T
  return JSON.parse(text) as T
}

/**
 * "search requests are limited to returning only the first 100,000 records
 * regardless of the pagination parameters."
 * (https://developer.copper.com/introduction/pagination.html)
 */
export const SEARCH_RESULT_CAP = 100_000

function searchCapError(path: string): Error {
  return Object.assign(
    new Error(
      `Copper ${path}/search returns only the first ${SEARCH_RESULT_CAP} records. This page ` +
        'reaches past that, so the rest of the collection cannot be listed through it.',
    ),
    { statusCode: 422, code: 'UPSTREAM_LIMIT' },
  )
}

export class CopperClient {
  constructor(private credentials: Credentials) {}

  /**
   * List via POST /search endpoint (Copper pagination pattern).
   * Returns array directly — hasMore determined by result length vs page_size.
   *
   * A page that reaches the search cap is refused: past it Copper answers
   * short or empty, which a walk would take for the end of the collection.
   */
  async search<T>(
    path: string,
    pageNumber = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    extra: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const start = (pageNumber - 1) * pageSize
    if (start >= SEARCH_RESULT_CAP) throw searchCapError(path)
    const body = {
      page_size: pageSize,
      page_number: pageNumber,
      ...extra,
    }
    const items = (await request<T[]>('POST', `${path}/search`, this.credentials, body)) ?? []
    // Cut short at the cap: whether more records exist is unknowable.
    if (items.length < pageSize && start + items.length >= SEARCH_RESULT_CAP) {
      throw searchCapError(path)
    }
    return {
      items,
      hasMore: items.length >= pageSize,
    }
  }

  async get<T>(path: string): Promise<T> {
    return request<T>('GET', path, this.credentials)
  }

  async list<T>(path: string): Promise<T[]> {
    return request<T[]>('GET', path, this.credentials)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.credentials, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.credentials, body)
  }

  async delete(path: string): Promise<void> {
    await request<unknown>('DELETE', path, this.credentials)
  }
}

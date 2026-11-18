import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

async function request<T>(
  method: string,
  path: string,
  token: string,
  params?: Record<string, unknown>,
  body?: unknown,
  onResponse?: (res: Response) => void,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
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
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Capsule API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  onResponse?.(res)

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

/**
 * Whether an RFC 5988 Link header carries rel="next".
 *
 * https://developer.capsulecrm.com/v2/overview/reading-from-the-api:
 * "The pagination info is included in the Link header." and
 * "next : The link relation for the immediate next page of results."
 */
export function hasNextLink(link: string | null): boolean {
  if (!link) return false
  return link
    .split(',')
    .some(
      (part) =>
        /;\s*rel\s*=\s*"?([^";]*)"?/i.exec(part)?.[1]?.split(/\s+/).includes('next') ?? false,
    )
}

export class CapsuleClient {
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.token, params)
  }

  /**
   * One page of a documented list endpoint, with the end signal Capsule
   * actually sends: the Link header's rel="next". List bodies carry only the
   * resource array (e.g. `{ "pipelines": [...] }`), no page counters.
   */
  async getPage<T>(
    path: string,
    params: Record<string, unknown>,
  ): Promise<{ body: T; hasNext: boolean }> {
    let link: string | null = null
    const body = await request<T>('GET', path, this.token, params, undefined, (res) => {
      link = res.headers.get('Link')
    })
    return { body, hasNext: hasNextLink(link) }
  }

  async list<T>(
    resourceKey: string,
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const page = Number(params['page'] ?? 1)
    const perPage = Number(params['perPage'] ?? DEFAULT_PAGE_SIZE)
    const queryParams = { ...params, page, perPage }

    const res = await request<Record<string, unknown>>('GET', path, this.token, queryParams)

    const items = (res[resourceKey] as T[] | undefined) ?? []
    const currentPage = res['currentPage'] as number | undefined
    const totalPages = res['totalPages'] as number | undefined
    const hasMore =
      currentPage !== undefined && totalPages !== undefined
        ? currentPage < totalPages
        : items.length >= perPage

    return { items, hasMore }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.token, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.token, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.token)
  }
}

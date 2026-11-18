import type { Credentials } from '@opensteward/shared'
import { DEFAULT_INSTANCE_URL, REST_PREFIX } from './constants'

// Twenty: "Authorization: Bearer YOUR_API_KEY" (https://docs.twenty.com/developers/extend/api.md).
// Cloud (api.twenty.com) or self-hosted (credentials.extra.instanceUrl).

async function request<T>(
  method: string,
  path: string,
  apiKey: string,
  baseUrl: string,
  params?: Record<string, unknown>,
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
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Twenty CRM API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

/**
 * Twenty's `pageInfo`: "Responses include **pageInfo** with `hasNextPage`,
 * `hasPreviousPage`, `startCursor`, and `endCursor`."
 * (https://api.twenty.com/open-api/core)
 */
export interface TwentyPageInfo {
  hasNextPage?: boolean
  hasPreviousPage?: boolean
  startCursor?: string | null
  endCursor?: string | null
}

export interface TwentyPage<T> {
  records: T[]
  totalCount?: number
  pageInfo: TwentyPageInfo
}

export class TwentyClient {
  private apiKey: string
  /** The instance origin, with no trailing slash. */
  readonly baseUrl: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    const instanceUrl = credentials.extra?.['instanceUrl'] as string | undefined
    this.baseUrl = (instanceUrl || DEFAULT_INSTANCE_URL).replace(/\/+$/, '')
  }

  /**
   * `GET /rest/<namePlural>`. Twenty's find-many handler answers
   * `{ data: { [objectNamePlural]: records }, totalCount, pageInfo }`
   * (rest-api-find-many.handler.ts).
   */
  async findMany<T>(
    plural: string,
    query: { limit?: number; starting_after?: string },
  ): Promise<TwentyPage<T>> {
    const res = await request<{
      data?: Record<string, unknown>
      totalCount?: number
      pageInfo?: TwentyPageInfo
    }>('GET', `${REST_PREFIX}/${plural}`, this.apiKey, this.baseUrl, query)
    const records = res?.data?.[plural]
    if (!Array.isArray(records)) {
      throw new Error(`Twenty GET ${REST_PREFIX}/${plural} returned no data.${plural} array`)
    }
    return {
      records: records as T[],
      totalCount: typeof res.totalCount === 'number' ? res.totalCount : undefined,
      pageInfo: res.pageInfo ?? {},
    }
  }

  /**
   * `GET /rest/<namePlural>/<id>`. Twenty's find-one handler answers
   * `{ data: { [objectNameSingular]: record } }` (rest-api-find-one.handler.ts).
   */
  async findOne<T>(plural: string, singular: string, id: string): Promise<T> {
    const res = await request<{ data?: Record<string, unknown> }>(
      'GET',
      `${REST_PREFIX}/${plural}/${encodeURIComponent(id)}`,
      this.apiKey,
      this.baseUrl,
    )
    const record = res?.data?.[singular]
    if (record == null || typeof record !== 'object') {
      throw Object.assign(new Error(`Twenty ${singular} ${id} not found`), { statusCode: 404 })
    }
    return record as T
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.apiKey, this.baseUrl, undefined, body)
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PATCH', path, this.apiKey, this.baseUrl, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.apiKey, this.baseUrl)
  }
}

import type { Credentials } from '@opensteward/shared'

/** List response from Pipeliner entity endpoints. */
interface PipelinerListResponse<T> {
  data: T[]
  /** Size of the whole filtered collection. */
  total?: number
  /** Returned only when the legacy limit & offset parameters are not sent. */
  page_info?: {
    end_cursor?: string | null
    has_next_page?: boolean
  }
  meta?: {
    total_count?: number
    [key: string]: unknown
  }
}

/** Single-item response from Pipeliner entity endpoints. */
interface PipelinerItemResponse<T> {
  data: T
}

function buildBaseUrl(credentials: Credentials): string {
  const spaceId = credentials.extra?.['spaceId'] as string | undefined
  if (!spaceId) {
    throw new Error('Pipeliner: credentials.extra.spaceId is required')
  }
  return `https://eu-central.pipelinersales.com/api/v100/rest/spaces/${spaceId}/entities`
}

function buildAuthHeader(credentials: Credentials): string {
  const username = credentials.extra?.['username'] as string | undefined
  if (!username) {
    throw new Error('Pipeliner: credentials.extra.username is required')
  }
  const token = credentials.accessToken
  return `Basic ${Buffer.from(`${username}:${token}`).toString('base64')}`
}

async function request<T>(
  method: string,
  baseUrl: string,
  path: string,
  authHeader: string,
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
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Pipeliner API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export class PipelinerClient {
  private baseUrl: string
  private authHeader: string

  constructor(credentials: Credentials) {
    this.baseUrl = buildBaseUrl(credentials)
    this.authHeader = buildAuthHeader(credentials)
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{
    items: T[]
    total: number | undefined
    endCursor: string | null
    hasNextPage: boolean
  }> {
    const res = await request<PipelinerListResponse<T>>(
      'GET',
      this.baseUrl,
      path,
      this.authHeader,
      params,
    )
    return {
      items: res.data ?? [],
      // Absent stays absent: a missing total must not read as an empty collection.
      total: res.total ?? res.meta?.total_count,
      endCursor: res.page_info?.end_cursor ?? null,
      hasNextPage: res.page_info?.has_next_page === true,
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const res = await request<PipelinerItemResponse<T>>(
      'GET',
      this.baseUrl,
      path,
      this.authHeader,
      params,
    )
    if (!res.data) {
      throw Object.assign(new Error(`Pipeliner: not found at ${path}`), { statusCode: 404 })
    }
    return res.data
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await request<PipelinerItemResponse<T>>(
      'POST',
      this.baseUrl,
      path,
      this.authHeader,
      undefined,
      body,
    )
    if (!res.data) throw new Error(`Pipeliner: POST ${path} returned no data`)
    return res.data
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await request<PipelinerItemResponse<T>>(
      'PUT',
      this.baseUrl,
      path,
      this.authHeader,
      undefined,
      body,
    )
    if (!res.data) throw new Error(`Pipeliner: PUT ${path} returned no data`)
    return res.data
  }

  async delete(path: string): Promise<void> {
    await request<unknown>('DELETE', this.baseUrl, path, this.authHeader)
  }
}

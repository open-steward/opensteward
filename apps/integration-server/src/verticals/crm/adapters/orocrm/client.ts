/**
 * OroCRM JSON:API client.
 *
 * OroCRM implements the JSON:API specification. Every response wraps
 * records in a `data` envelope:
 *
 *   GET /api/contacts          → { data: [...], meta: { totalCount } }
 *   GET /api/contacts/{id}     → { data: { type, id, attributes, relationships } }
 *
 * Pagination uses page-based params: page[number] (1-indexed) + page[size].
 * Auth header: Authorization: Bearer {token}
 * Content-Type: application/vnd.api+json
 *
 * Docs: https://doc.oroinc.com/backend/api/
 */
import type { Credentials } from '@opensteward/shared'
import { API_PATH, DEFAULT_PAGE_SIZE, JSON_API_MEDIA_TYPE } from './constants'

/** JSON:API single-record response. */
export interface JsonApiRecord {
  type: string
  id: string
  attributes: Record<string, unknown>
  relationships?: Record<string, {
    data?: { type: string; id: string } | Array<{ type: string; id: string }> | null
  }>
  [key: string]: unknown
}

/** JSON:API collection response. */
interface JsonApiCollectionResponse {
  data: JsonApiRecord[]
  meta?: { totalCount?: number }
  links?: {
    next?: string | null
    prev?: string | null
    first?: string | null
    last?: string | null
  }
}

/** JSON:API single-record response. */
interface JsonApiSingleResponse {
  data: JsonApiRecord
}

/** Extract the single related-record ID from a JSON:API relationship. */
function relId(
  record: JsonApiRecord,
  relName: string,
): string | undefined {
  const rel = record.relationships?.[relName]?.data
  if (!rel) return undefined
  if (Array.isArray(rel)) return rel[0]?.id
  return rel.id
}

/** Resolve baseUrl stored in credentials.extra, fallback to empty string. */
function resolveBaseUrl(credentials: Credentials): string {
  const extra = credentials.extra as Record<string, unknown> | undefined
  return String(extra?.['baseUrl'] ?? '')
}

async function request<T>(
  method: string,
  fullUrl: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(fullUrl)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v))
      }
    }
  }

  const isWrite = method !== 'GET' && method !== 'HEAD' && body != null
  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Accept': JSON_API_MEDIA_TYPE,
      ...(isWrite ? { 'Content-Type': JSON_API_MEDIA_TYPE } : {}),
    },
    body: isWrite ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`OroCRM API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  // 204 No Content on DELETE
  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class OrocrmClient {
  constructor(private credentials: Credentials) {}

  private apiUrl(path: string): string {
    const base = resolveBaseUrl(this.credentials)
    return `${base}${API_PATH}${path}`
  }

  async list(
    path: string,
    pageNumber: number = 1,
    pageSize: number = DEFAULT_PAGE_SIZE,
  ): Promise<{ items: JsonApiRecord[]; totalCount?: number }> {
    const res = await request<JsonApiCollectionResponse>(
      'GET',
      this.apiUrl(path),
      this.credentials,
      {
        'page[number]': pageNumber,
        'page[size]': pageSize,
      },
    )
    return {
      items: res.data ?? [],
      totalCount: res.meta?.totalCount,
    }
  }

  async get(path: string): Promise<JsonApiRecord> {
    const res = await request<JsonApiSingleResponse>(
      'GET',
      this.apiUrl(path),
      this.credentials,
    )
    return res.data
  }

  async post(path: string, body: unknown): Promise<JsonApiRecord> {
    const res = await request<JsonApiSingleResponse>(
      'POST',
      this.apiUrl(path),
      this.credentials,
      undefined,
      body,
    )
    return res.data
  }

  async patch(path: string, body: unknown): Promise<JsonApiRecord> {
    const res = await request<JsonApiSingleResponse>(
      'PATCH',
      this.apiUrl(path),
      this.credentials,
      undefined,
      body,
    )
    return res.data
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', this.apiUrl(path), this.credentials)
  }

  /** Convenience: pull the single related-record ID from a JSON:API record. */
  getRelId = relId
}

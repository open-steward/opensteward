/**
 * Spiro REST API client.
 *
 * Base URL : https://api.spiro.ai
 * Auth     : Authorization: Bearer {access_token}
 * Format   : JSON:API ("[jsonapi](http://jsonapi.org/) specification is used
 *            as a standard for request/response format."), with
 *            `Accept` and `Content-type` both `application/vnd.api+json`.
 * Paging   : `page[number]` ("Page number") and `page[size]` ("Page size") on
 *            every list endpoint; each list response carries
 *            `meta.pagination { current_page, per_page, total_pages, next_page }`,
 *            with `next_page: null` on the last page.
 *
 * Source: https://developers.spiro.ai/api/docs/v1/openapi.json
 */
import type { Credentials } from '@opensteward/shared'
import { SPIRO_BASE_URL, SPIRO_MEDIA_TYPE } from './constants'

/** A JSON:API resource identifier (`{ "id": "441", "type": "company" }`). */
export interface SpiroIdentifier {
  id: string
  type: string
}

/** A JSON:API relationship: to-one, to-many, or explicitly empty. */
export interface SpiroRelationship {
  data: SpiroIdentifier | SpiroIdentifier[] | null
}

/** A JSON:API resource object as Spiro returns it. */
export interface SpiroResource<A> {
  id: string
  type: string
  attributes: A
  relationships?: Record<string, SpiroRelationship>
}

/** `meta.pagination` on every documented list response. */
export interface SpiroPagination {
  current_page: number
  per_page: number
  total_pages: number
  next_page: number | null
}

export interface SpiroListDocument<A> {
  data: SpiroResource<A>[]
  meta?: { pagination?: SpiroPagination }
}

export interface SpiroDocument<A> {
  data: SpiroResource<A>
}

/** Query values; keys are sent verbatim (`page[number]`, `filter[id_eq]`). */
export type SpiroQuery = Record<string, string | number | undefined>

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  query?: SpiroQuery,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${SPIRO_BASE_URL}${path}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': SPIRO_MEDIA_TYPE,
      Accept: SPIRO_MEDIA_TYPE,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Spiro API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  // 204 No Content on DELETE
  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class SpiroClient {
  constructor(private credentials: Credentials) {}

  /** One page of a list endpoint, exactly as Spiro returned it. */
  async list<A>(path: string, query: SpiroQuery = {}): Promise<SpiroListDocument<A>> {
    return request<SpiroListDocument<A>>('GET', path, this.credentials, query)
  }

  async get<T>(path: string, query?: SpiroQuery): Promise<T> {
    return request<T>('GET', path, this.credentials, query)
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

/** The id of a to-one relationship, or `undefined` when absent or empty. */
export function relatedId(
  resource: Pick<SpiroResource<unknown>, 'relationships'>,
  name: string,
): string | undefined {
  const data = resource.relationships?.[name]?.data
  if (data == null || Array.isArray(data)) return undefined
  return data.id
}

/**
 * 1CRM REST API client.
 *
 * All data endpoints live under `<baseUrl>/api.php/data/<Module>`.
 * Pagination uses `offset` + `limit` query parameters. Responses
 * include `records[]`, `total_results`, `offset`, and `limit`.
 *
 * The tenant base URL is stored in credentials.extra.baseUrl (set at
 * token-exchange time); callers may also supply it at construction.
 *
 * Auth header: Authorization: Bearer <access_token>
 */

import type { Credentials } from '@opensteward/shared'
import { ONECRM_API_PATH, ONECRM_DEFAULT_LIMIT } from './constants'

/** Shape of a 1CRM list response. */
interface OneCrmListResponse<T> {
  records: T[]
  total_results: number
  offset: number
  limit: number
}

/** Shape of a 1CRM single-record response (GET by id). */
interface OneCrmRecordResponse<T> {
  record: T
}

/** Shape of a 1CRM create response. */
interface OneCrmCreateResponse {
  id: string
}

/** Shape of a 1CRM update/delete response. */
interface OneCrmMutateResponse {
  result: boolean
}

async function request<T>(
  method: string,
  url: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const u = new URL(url)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        u.searchParams.set(k, String(v))
      }
    }
  }

  const res = await fetch(u.toString(), {
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
      new Error(`1CRM API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  // 204 No Content on DELETE
  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class OneCrmClient {
  private baseUrl: string

  constructor(
    private credentials: Credentials,
    /** The customer's 1CRM URL, already normalised by the adapter. */
    baseUrl: string,
  ) {
    this.baseUrl = baseUrl
  }

  private dataUrl(module: string, id?: string): string {
    const path = id
      ? `${ONECRM_API_PATH}/data/${module}/${id}`
      : `${ONECRM_API_PATH}/data/${module}`
    return `${this.baseUrl}${path}`
  }

  /**
   * List records of a module with offset-based pagination.
   * Returns the raw records array plus pagination metadata.
   */
  async list<T>(
    module: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; total: number | undefined; offset: number }> {
    const merged: Record<string, unknown> = {
      limit: ONECRM_DEFAULT_LIMIT,
      ...params,
    }
    const res = await request<OneCrmListResponse<T>>(
      'GET',
      this.dataUrl(module),
      this.credentials,
      merged,
    )
    return {
      items: res.records ?? [],
      // Absent is unknown, not zero: a zero would end paging on page 1.
      total: typeof res.total_results === 'number' ? res.total_results : undefined,
      offset: res.offset ?? 0,
    }
  }

  /** Fetch a single record by ID. */
  async get<T>(module: string, id: string): Promise<T> {
    const res = await request<OneCrmRecordResponse<T>>(
      'GET',
      this.dataUrl(module, id),
      this.credentials,
    )
    return res.record
  }

  /** Create a new record. Returns the new record's ID. */
  async create(module: string, data: Record<string, unknown>): Promise<string> {
    const res = await request<OneCrmCreateResponse>(
      'POST',
      this.dataUrl(module),
      this.credentials,
      undefined,
      { data },
    )
    return res.id
  }

  /** Fetch the newly created record after create. */
  async createAndFetch<T>(module: string, data: Record<string, unknown>): Promise<T> {
    const id = await this.create(module, data)
    return this.get<T>(module, id)
  }

  /** Update an existing record by ID. */
  async update(
    module: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    const res = await request<OneCrmMutateResponse>(
      'PATCH',
      this.dataUrl(module, id),
      this.credentials,
      undefined,
      { data },
    )
    return res.result ?? true
  }

  /** Update and then fetch the updated record. */
  async updateAndFetch<T>(
    module: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<T> {
    await this.update(module, id, data)
    return this.get<T>(module, id)
  }

  /** Delete a record by ID. */
  async delete(module: string, id: string): Promise<void> {
    await request<OneCrmMutateResponse>(
      'DELETE',
      this.dataUrl(module, id),
      this.credentials,
    )
  }
}

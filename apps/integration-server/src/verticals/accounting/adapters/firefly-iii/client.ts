/**
 * HTTP client for the Firefly III REST API v1.
 *
 * The base URL is constructed from the instance host stored in credentials.tenantId
 * (e.g. "https://my.firefly-iii.example.com") plus the /api/v1 path prefix.
 *
 * Auth header : Authorization: Bearer <access_token>
 * Pagination  : ?page=<1-based>&limit=<n>
 *
 * All responses follow the JSON:API envelope:
 *   { data: [...], meta: { pagination: { total, count, per_page, current_page, total_pages } } }
 */

import axios, { type AxiosInstance } from 'axios'
import { FIREFLY_API_PATH, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { normaliseInstanceUrl, storedInstanceUrl } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/** JSON:API pagination envelope returned by list endpoints. */
export interface FireflyListEnvelope<T> {
  data: T[]
  meta: {
    pagination: {
      total: number
      count: number
      per_page: number
      current_page: number
      total_pages: number
    }
  }
}

/** JSON:API single-item envelope returned by show endpoints. */
export interface FireflySingleEnvelope<T> {
  data: T
}

/** A JSON:API resource object as returned by Firefly III. */
export interface FireflyResource<A> {
  type: string
  id: string
  attributes: A
}

export class FireflyClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // No fallback host: a missing server must not send the token to a demo instance.
    const raw = storedInstanceUrl(credentials)
    if (!raw) {
      throw new Error(
        'Firefly III URL is missing from the connection; reconnect it so the server URL is recorded.',
      )
    }
    const host = normaliseInstanceUrl(raw)
    this.http = axios.create({
      baseURL: `${host}${FIREFLY_API_PATH}/`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.api+json',
      },
    })
  }

  /** Fetch a single resource. */
  async get<A>(path: string): Promise<FireflySingleEnvelope<FireflyResource<A>>> {
    return withRetry(async () => {
      const { data } = await this.http.get<FireflySingleEnvelope<FireflyResource<A>>>(path)
      return data
    })
  }

  /** Fetch a paginated list. */
  async list<A>(
    path: string,
    page = 1,
    limit = DEFAULT_PAGE_SIZE,
    extra?: Record<string, unknown>,
  ): Promise<FireflyListEnvelope<FireflyResource<A>>> {
    const pageSize = Math.min(limit, MAX_PAGE_SIZE)
    return withRetry(async () => {
      const { data } = await this.http.get<FireflyListEnvelope<FireflyResource<A>>>(path, {
        params: { page, limit: pageSize, ...extra },
      })
      return data
    })
  }

  /** POST to create or update a resource. */
  async post<A>(path: string, body: unknown): Promise<FireflySingleEnvelope<FireflyResource<A>>> {
    return withRetry(async () => {
      const { data } = await this.http.post<FireflySingleEnvelope<FireflyResource<A>>>(path, body)
      return data
    })
  }

  /** PUT to update a resource. */
  async put<A>(path: string, body: unknown): Promise<FireflySingleEnvelope<FireflyResource<A>>> {
    return withRetry(async () => {
      const { data } = await this.http.put<FireflySingleEnvelope<FireflyResource<A>>>(path, body)
      return data
    })
  }
}

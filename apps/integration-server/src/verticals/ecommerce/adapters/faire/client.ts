/**
 * Faire External API v2 client.
 *
 * Auth: every request carries BOTH headers. Docs ("Using OAuth Access Token"):
 *   `X-FAIRE-APP-CREDENTIALS` — "The _applicationId:applicationSecret_ encoded in the Base64 format."
 *   `X-FAIRE-OAUTH-ACCESS-TOKEN` — "The OAuth access token."
 *   "Only by using these two headers together, you are able to make requests
 *   and access resources at Faire."
 * The spec's securitySchemes say the same (`OAuth` + `AppCredentials`, both
 * required). The adapter used to send a single `X-FAIRE-ACCESS-TOKEN`.
 *
 * Paging: GET /products and GET /orders return `{ <resource>: [...], cursor }`.
 * Spec: `cursor` — "A cursor for pagination. Use this value in subsequent
 * requests to get the next page of results." Legacy docs for the same
 * endpoints: "When there are no more products to paginate, a response will not
 * contain a value for cursor", and "When cursor is passed, updated_at_min, sku,
 * and include_deleted must not be passed" (orders: "updated_at_min,
 * created_at_min, excluded_states and ship_after_max").
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { BASE_URL } from './constants'

/** The application's credentials, from the adapter config. */
export interface FaireAppCredentials {
  applicationId: string
  applicationSecret: string
}

/** One upstream page of a cursor-paged list. */
export interface FaireCursorPage<T> {
  items: T[]
  /** The response's `cursor`; absent when the response carried none (the last page). */
  next?: string
}

export class FaireClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, app: FaireAppCredentials, baseUrl: string = BASE_URL) {
    if (!app.applicationId || !app.applicationSecret) {
      throw new Error(
        'Faire requires the application id and secret (X-FAIRE-APP-CREDENTIALS) on every request; ' +
          'set clientId and clientSecret in the adapter config',
      )
    }
    if (!credentials.accessToken) {
      throw new Error('Faire requires an OAuth access token (X-FAIRE-OAUTH-ACCESS-TOKEN)')
    }
    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        'X-FAIRE-APP-CREDENTIALS': Buffer.from(
          `${app.applicationId}:${app.applicationSecret}`,
        ).toString('base64'),
        'X-FAIRE-OAUTH-ACCESS-TOKEN': credentials.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * One page of GET /products or GET /orders. `query` is sent as given: the
   * caller sends its filters on the first page only and `{ limit, cursor }`
   * after, as the docs require.
   */
  async cursorPage<T>(
    path: string,
    resourceKey: 'products' | 'orders',
    query: Record<string, unknown>,
  ): Promise<FaireCursorPage<T>> {
    const res = await this.get<Record<string, unknown>>(path, query)
    const items = res[resourceKey]
    const cursor = res['cursor']
    return {
      items: Array.isArray(items) ? (items as T[]) : [],
      next: typeof cursor === 'string' && cursor !== '' ? cursor : undefined,
    }
  }
}

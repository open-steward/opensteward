/**
 * Nacelle API clients.
 *
 *  - `NacelleStorefrontClient` — Storefront GraphQL API (catalog reads).
 *    Endpoint: `${STOREFRONT_GRAPHQL_BASE}/${spaceId}` (space id is part of
 *    the URL path, not a header — https://docs.nacelle.com/docs/storefront-graphql-api-stable).
 *    Auth: `Authorization: Bearer <privateAccessToken>`
 *    (https://docs.nacelle.com/docs/auth-storefront).
 *  - `NacelleNomsClient` — NOMS REST API. Only the "Create Order" endpoint is
 *    implemented; see constants.ts for why the rest of NOMS is out of scope.
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { NOMS_CREATE_ORDER_URL, STOREFRONT_GRAPHQL_BASE } from './constants'

export interface GraphQlResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

export class NacelleGraphQlError extends Error {
  constructor(
    public readonly query: string,
    public readonly errors: Array<{ message: string }>,
  ) {
    super(`Nacelle GraphQL error: ${errors.map((e) => e.message).join('; ')}`)
    this.name = 'NacelleGraphQlError'
  }
}

export class NacelleStorefrontClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, spaceId: string) {
    this.http = axios.create({
      baseURL: `${STOREFRONT_GRAPHQL_BASE}/${spaceId}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<GraphQlResponse<T>>('', { query, variables })
      if (data.errors && data.errors.length > 0) {
        throw new NacelleGraphQlError(query, data.errors)
      }
      if (data.data === undefined) {
        throw new Error('Nacelle Storefront GraphQL response had no `data` field')
      }
      return data.data
    })
  }
}

export class NacelleNomsClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, spaceId: string) {
    this.http = axios.create({
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        'X-Nacelle-Space-ID': spaceId,
      },
      timeout: 30_000,
    })
  }

  async createOrder<T>(body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(NOMS_CREATE_ORDER_URL, body)
      return data
    })
  }
}

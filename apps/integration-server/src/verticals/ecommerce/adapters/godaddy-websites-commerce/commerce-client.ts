/**
 * GoDaddy Commerce API client — the documented read surface this adapter's
 * list/get methods use.
 *
 * Docs (first-party, fetched 2026-09-25):
 *  - https://developer.godaddy.com/docs/api-users/auth
 *    "Personal Access Token (PAT) Authorization: Bearer $GODADDY_PAT"
 *  - https://developer.godaddy.com/openapi/catalog-graphql.json
 *    server "https://api.godaddy.com/v2/commerce", path
 *    "/stores/{storeId}/catalog-subgraph": "Send the same store ID in the
 *    `{storeId}` path and the `x-store-id` header. The header is required."
 *  - https://developer.godaddy.com/openapi/orders.json
 *    path "/v1/commerce/order-subgraph" on "https://api.godaddy.com", with a
 *    required `x-store-id` header.
 *  - https://developer.godaddy.com/openapi/customers.json
 *    server "https://api.godaddy.com/v1/commerce", paths
 *    "/stores/{storeId}/customers" and "/stores/{storeId}/customers/{customerId}".
 *  - https://developer.godaddy.com/docs/references/rest/orders
 *    "This is a GraphQL endpoint, so **most failures still return HTTP 200**.
 *    Resolver and authorization errors are reported inside the `errors` array"
 */

import axios, { type AxiosInstance } from 'axios'
import { withRetry } from '@opensteward/shared'

export const GODADDY_API_BASE = 'https://api.godaddy.com'

/** A Relay-style connection as the catalog and order subgraphs return it. */
export interface GraphqlConnection<N> {
  edges?: Array<{ node?: N | null } | null> | null
  pageInfo: { hasNextPage: boolean; endCursor?: string | null }
  /** Catalog connections only ("totalCount `Int!` **non-null**"). */
  totalCount?: number
}

interface GraphqlResponse<T> {
  data?: T | null
  errors?: Array<{ message?: string; extensions?: { code?: string } }>
}

export class GoDaddyCommerceClient {
  private readonly http: AxiosInstance

  constructor(
    accessToken: string,
    private readonly storeId: string,
  ) {
    this.http = axios.create({
      baseURL: GODADDY_API_BASE,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** POST a document to the catalog subgraph. */
  catalog<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    return this.graphql<T>(
      `/v2/commerce/stores/${encodeURIComponent(this.storeId)}/catalog-subgraph`,
      query,
      variables,
    )
  }

  /** POST a document to the order subgraph (store selected by header only). */
  orders<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    return this.graphql<T>('/v1/commerce/order-subgraph', query, variables)
  }

  /** GET a store-scoped Commerce REST path, e.g. `customers`. */
  get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(
        `/v1/commerce/stores/${encodeURIComponent(this.storeId)}/${path}`,
        { params },
      )
      return data
    })
  }

  private graphql<T>(path: string, query: string, variables: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data: body } = await this.http.post<GraphqlResponse<T>>(
        path,
        { query, variables },
        { headers: { 'x-store-id': this.storeId } },
      )
      if (body?.errors && body.errors.length > 0) {
        const detail = body.errors
          .map((e) => [e.extensions?.code, e.message].filter(Boolean).join(': '))
          .join('; ')
        throw new Error(`GoDaddy GraphQL error: ${detail}`)
      }
      if (!body?.data) throw new Error('GoDaddy GraphQL response carried no data')
      return body.data
    })
  }
}

/**
 * Marketplacer Seller API GraphQL client.
 *
 * "there is only 1 GraphQL endpoint" — `https://{instance}/graphql` — and
 * "all GraphQL requests to the Marketplacer GraphQL API are POST requests".
 * Auth is a static header, NOT `Authorization: Bearer`:
 *   "Enter 'marketplacer-api-key' for the header Key"
 * plus optional HTTP Basic auth on non-production instances.
 *
 * Docs: https://api.marketplacer.com/docs/seller-api/getting_started/
 */
import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { GRAPHQL_PATH } from './constants'

interface GraphQLErrorShape {
  message: string
  path?: Array<string | number>
  extensions?: Record<string, unknown>
}

/** Thrown for `errors[]` in an otherwise-200 GraphQL response, carrying every message. */
export class MarketplacerGraphQLError extends Error {
  readonly errors: GraphQLErrorShape[]
  constructor(errors: GraphQLErrorShape[]) {
    super(
      errors.length > 0
        ? errors.map((e) => e.message).join('; ')
        : 'Marketplacer GraphQL request failed with no error message',
    )
    this.name = 'MarketplacerGraphQLError'
    this.errors = errors
  }
}

interface GraphQLResponseBody<T> {
  data?: T
  errors?: GraphQLErrorShape[]
}

export class MarketplacerClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const instanceHost = credentials.extra?.['instanceHost'] as string | undefined
    const apiKey = (credentials.extra?.['apiKey'] as string | undefined) ?? credentials.accessToken
    if (!instanceHost || !apiKey) {
      throw new Error(
        'Marketplacer adapter is missing extra.instanceHost or a Seller API key — connect ' +
          'via the Connect Link form with the operator instance URL and your Seller API key.',
      )
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'marketplacer-api-key': apiKey,
    }
    const username = credentials.extra?.['basicAuthUsername'] as string | undefined
    const password = credentials.extra?.['basicAuthPassword'] as string | undefined
    this.http = axios.create({
      baseURL: `${instanceHost.replace(/\/+$/, '')}${GRAPHQL_PATH}`,
      headers,
      timeout: 30_000,
      ...(username && password ? { auth: { username, password } } : {}),
    })
  }

  /**
   * Execute one GraphQL query or mutation. GraphQL errors arrive inside a
   * 200 response body (`{ data, errors }`) — those are thrown here as
   * {@link MarketplacerGraphQLError} so callers never have to check `errors`
   * themselves. An HTTP-level 429 (page size / rate limit exceeded) is
   * retried with backoff by `withRetry`.
   */
  async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<GraphQLResponseBody<T>>('', { query, variables })
      if (data.errors && data.errors.length > 0) {
        throw new MarketplacerGraphQLError(data.errors)
      }
      if (data.data === undefined) {
        throw new Error('Marketplacer GraphQL response had neither `data` nor `errors`.')
      }
      return data.data
    })
  }
}

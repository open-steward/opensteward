/**
 * Orderchamp supplier GraphQL client.
 *
 * "A GraphQL API only has one endpoint, to which you will send all your
 * queries: POST https://api.orderchamp.com/v1/graphql" — private-app auth is
 * `Authorization: Bearer {token}`.
 *
 * Rate limiting is cost-based, not HTTP 429: "All requests that are made
 * after the limit has been exceeded are throttled and an
 * `{errors: [{ message: "Throttled" }]}` error is returned." — a normal
 * 200 response carrying a GraphQL-level error, not an HTTP-level one. This
 * client recognises that specific message and retries it with backoff via
 * the shared `withRetry` (which keys on HTTP 429) by re-throwing it shaped
 * as one.
 *
 * Docs: https://developers.orderchamp.com/authentication
 *       https://developers.orderchamp.com/rate-limits
 */
import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { GRAPHQL_ENDPOINT, THROTTLED_ERROR_MESSAGE } from './constants'

interface GraphQLErrorShape {
  message: string
  path?: Array<string | number>
  extensions?: Record<string, unknown>
}

/** Thrown for `errors[]` in an otherwise-200 GraphQL response (never for a `Throttled` error — see `request`). */
export class OrderchampGraphQLError extends Error {
  readonly errors: GraphQLErrorShape[]
  constructor(errors: GraphQLErrorShape[]) {
    super(
      errors.length > 0
        ? errors.map((e) => e.message).join('; ')
        : 'Orderchamp GraphQL request failed with no error message',
    )
    this.name = 'OrderchampGraphQLError'
    this.errors = errors
  }
}

interface GraphQLResponseBody<T> {
  data?: T
  errors?: GraphQLErrorShape[]
}

export class OrderchampClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    if (!credentials.accessToken) {
      throw new Error('Orderchamp adapter is missing an access token — connect via the Connect Link form.')
    }
    this.http = axios.create({
      baseURL: GRAPHQL_ENDPOINT,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<GraphQLResponseBody<T>>('', { query, variables })
      if (data.errors && data.errors.length > 0) {
        if (data.errors.some((e) => e.message === THROTTLED_ERROR_MESSAGE)) {
          // Reshape as an HTTP-429-like error so the shared `withRetry` (which
          // keys on `err.response.status`) retries it with backoff.
          throw Object.assign(new Error(THROTTLED_ERROR_MESSAGE), { response: { status: 429 } })
        }
        throw new OrderchampGraphQLError(data.errors)
      }
      if (data.data === undefined) {
        throw new Error('Orderchamp GraphQL response had neither `data` nor `errors`.')
      }
      return data.data
    })
  }
}

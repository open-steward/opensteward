import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { GRAPHQL_URL } from './constants'

/**
 * Thin GraphQL client for the ZenHub API.
 *
 * Every request is a POST to `https://api.zenhub.com/public/graphql` with the
 * Personal API Key in `Authorization: Bearer <key>`. ZenHub returns HTTP 200
 * even for application-level errors; callers check `data.errors` themselves.
 *
 * Rate limit: 100 req/min per key. On 429 or 5xx the client retries with
 * exponential back-off (max 4 retries).
 *
 * Relay cursor pagination: callers pass `first` and `after` (cursor) as
 * GraphQL variables. The response carries `pageInfo.endCursor` and
 * `pageInfo.hasNextPage`.
 */

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export interface GqlResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

export class ZenhubClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: GRAPHQL_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async query<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<GqlResponse<T>> {
    return withRetry(async () => {
      const { data } = await this.http.post<GqlResponse<T>>('', { query, variables })
      return data
    })
  }
}

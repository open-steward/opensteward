import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

/**
 * Thin HTTP client for the Perdoo GraphQL API.
 *
 * Every request is a JSON POST to the single GraphQL endpoint, authenticated
 * with `Authorization: Bearer {token}`. Queries are retried on transient
 * failures (429 / 5xx) with exponential back-off.
 *
 * Pagination is relay-style: responses contain `pageInfo.endCursor` and
 * `pageInfo.hasNextPage`. Callers drive pagination via the `after` variable.
 */

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

export class PerdooClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
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
  ): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<GraphQLResponse<T>>('', {
        query,
        variables: variables ?? undefined,
      })
      if (data.errors && data.errors.length > 0) {
        throw new Error(`Perdoo GraphQL error: ${data.errors.map((e) => e.message).join('; ')}`)
      }
      if (data.data == null) {
        throw new Error('Perdoo GraphQL response contained no data')
      }
      return data.data
    })
  }
}

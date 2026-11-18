/**
 * Plain GraphQL client.
 *
 * Plain exposes a single GraphQL endpoint at https://core-api.plain.com/graphql/v1.
 * All requests are POST with Content-Type: application/json.
 * Authentication: Authorization: Bearer <api_key>
 *
 * Docs: https://www.plain.com/docs/graphql/introduction
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

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
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>
}

export class PlainClient {
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

  /**
   * Execute a GraphQL query or mutation.
   * Returns the data field from the response, throwing on GraphQL errors.
   */
  async query<T>(
    query: string,
    variables?: Record<string, unknown>,
    operationName?: string,
  ): Promise<T> {
    return withRetry(async () => {
      const { data: res } = await this.http.post<GraphQLResponse<T>>('', {
        query,
        variables,
        ...(operationName ? { operationName } : {}),
      })
      if (res.errors && res.errors.length > 0) {
        throw new Error(`Plain GraphQL error: ${res.errors.map((e) => e.message).join('; ')}`)
      }
      return res.data as T
    })
  }
}

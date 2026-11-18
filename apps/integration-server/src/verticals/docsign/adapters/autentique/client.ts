/**
 * Autentique GraphQL client.
 *
 * Single POST `/v2/graphql` with body `{ query, variables }`. Returns
 * `{ data, errors }`. The adapter wraps each read as a GraphQL query.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, GRAPHQL_PATH } from './constants'

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

export class AutentiqueClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<{ data?: T; errors?: Array<{ message: string }> }>(
        GRAPHQL_PATH,
        { query, variables },
        { headers: { 'Content-Type': 'application/json' } },
      )
      if (data.errors && data.errors.length > 0) {
        throw new Error(`autentique GraphQL: ${data.errors.map((e) => e.message).join('; ')}`)
      }
      return data.data as T
    })
  }
}

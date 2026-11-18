/**
 * Anvil GraphQL API client.
 *
 * Anvil is GraphQL-only for the resources this vertical reads. Every request
 * is a POST to the single GraphQL endpoint with an HTTP Basic `Authorization`
 * header built from the API key (key as username, empty password). Lists
 * (e.g. `organization.etchPackets`) are page+limit paginated and return a
 * `{ page, pageSize, pageCount, rowCount, items }` envelope.
 *
 * Docs: https://www.useanvil.com/docs/api/getting-started/
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { GRAPHQL_URL } from './constants'

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

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

export class AnvilClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // Anvil Basic auth: API key is the username, password is empty. The key
    // is stored on `accessToken` by the credential-form exchange.
    const apiKey = String(credentials.accessToken ?? '')
    const encoded = Buffer.from(`${apiKey}:`, 'ascii').toString('base64')
    this.http = axios.create({
      baseURL: GRAPHQL_URL,
      headers: {
        Authorization: `Basic ${encoded}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Execute a GraphQL query and return the typed `data` payload. */
  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<GraphQLResponse<T>>('', { query, variables })
      if (data.errors && data.errors.length > 0) {
        throw new Error(`Anvil GraphQL error: ${data.errors.map((e) => e.message).join('; ')}`)
      }
      if (data.data === undefined || data.data === null) {
        throw new Error('Anvil GraphQL response missing data')
      }
      return data.data
    })
  }
}

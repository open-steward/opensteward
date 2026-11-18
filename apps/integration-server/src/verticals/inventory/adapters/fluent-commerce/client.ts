/**
 * Fluent Commerce GraphQL client.
 *
 * All Fluent API calls are GraphQL POSTs.
 * Endpoint: https://{account}.api.fluentretail.com/graphql (production)
 *           https://{account}.sandbox.api.fluentretail.com/graphql (sandbox)
 *
 * The `fluent.account` header is required on every request in addition to
 * the standard Bearer token.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { fluentApiHost, normaliseFluentAccount } from './constants'

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
  errors?: Array<{ message: string; locations?: unknown; path?: unknown }>
}

export class FluentCommerceClient {
  private http: AxiosInstance
  private accountId: string

  constructor(credentials: Credentials) {
    // Re-validated here: the stored account decides where the bearer token goes.
    const account = normaliseFluentAccount(credentials.extra?.['accountId'], credentials.extra?.['env'])
    this.accountId = account.accountId

    this.http = axios.create({
      baseURL: `https://${fluentApiHost(account)}/graphql`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'fluent.account': this.accountId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data: res } = await this.http.post<GraphQLResponse<T>>('', { query, variables })
      if (res.errors?.length) {
        throw new Error(`fluent-commerce GraphQL error: ${res.errors.map((e) => e.message).join('; ')}`)
      }
      return res.data as T
    })
  }
}

/**
 * Chaskiq GraphQL client.
 *
 * Auth: `Authorization: Bearer <token>` + `APP: <appKey>` header.
 * Chaskiq resolves the workspace from the APP header; the token authorises
 * the agent identity via Doorkeeper.
 *
 * Endpoint: POST /graphql (cloud default: https://app.chaskiq.io/graphql;
 * self-hosted instances pass instanceUrl via extra).
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_GRAPHQL_URL } from './constants'

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

export class ChaskiqClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, string>
    const instanceUrl = extra['instanceUrl']
    const graphqlUrl = instanceUrl
      ? `${instanceUrl.replace(/\/$/, '')}/graphql`
      : DEFAULT_GRAPHQL_URL

    this.http = axios.create({
      baseURL: graphqlUrl,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        APP: extra['appKey'] ?? '',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<GraphQLResponse<T>>('', {
        query,
        variables: variables ?? {},
      })
      if (data.errors?.length) {
        throw new Error(`Chaskiq GraphQL error: ${data.errors.map((e) => e.message).join('; ')}`)
      }
      return data.data as T
    })
  }
}

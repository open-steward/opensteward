import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_HOST, GRAPHQL_BASE_HOST } from './constants'

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

/**
 * ContractworksClient — wraps the Contracting.Works REST (write) and
 * GraphQL (read) APIs.
 *
 * Every URL embeds the tenant's clientId:
 *   REST:    https://<host>/client/<clientId>/<Entity>/Upsert
 *   GraphQL: https://<graphql-host>/client/<clientId>/graphql
 *
 * The bearer token is taken from credentials.accessToken; the clientId
 * is taken from credentials.extra.tenantId (set at credential-entry time).
 */
export class ContractworksClient {
  private rest: AxiosInstance
  private gql: AxiosInstance
  private clientId: string

  constructor(credentials: Credentials) {
    const tenantId = String(
      (credentials.extra as Record<string, unknown> | undefined)?.['tenantId'] ?? '',
    )
    this.clientId = tenantId

    const authHeader = `Bearer ${credentials.accessToken}`

    this.rest = axios.create({
      baseURL: `${API_BASE_HOST}/client/${tenantId}`,
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })

    this.gql = axios.create({
      baseURL: `${GRAPHQL_BASE_HOST}/client/${tenantId}/graphql`,
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** POST to a REST write endpoint (e.g. /Assignment/Upsert). */
  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.rest.post<T>(path, body)
      return data
    })
  }

  /** POST a GraphQL query; returns the `data` field of the response. */
  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data: resp } = await this.gql.post<{ data: T; errors?: unknown[] }>('', {
        query,
        variables,
      })
      if (resp.errors && (resp.errors as unknown[]).length > 0) {
        throw new Error(`GraphQL errors: ${JSON.stringify(resp.errors)}`)
      }
      return resp.data
    })
  }

  getClientId(): string {
    return this.clientId
  }
}

/**
 * Thin GraphQL client for the Artia API.
 *
 * Every request is a POST to `https://api.artia.com/graphql` with:
 *   Authorization: Bearer <token>
 *   OrganizationId: <organizationId>
 *
 * Artia returns HTTP 200 even for application-level errors; callers should
 * inspect `data.errors` when present. On 429 or 5xx responses the client
 * retries with exponential back-off (up to 4 retries).
 *
 * Rate limit: 100 req/min per IP.
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

export class ArtiaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const organizationId = String(credentials.extra?.['organizationId'] ?? '')
    this.http = axios.create({
      baseURL: GRAPHQL_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        OrganizationId: organizationId,
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

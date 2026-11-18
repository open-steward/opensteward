import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { apiOrigin } from './constants'

/**
 * Thin HTTP client for the Birdview PSA REST API v2.
 *
 * The API lives on the customer's own subdomain
 * (`https://{{host}}.go.easyprojects.net/api/v2/...`, per
 * https://help.birdviewpsa.com/hc/en-us/articles/38116720932749), so a
 * connection without an account slug cannot be served and the client throws
 * rather than guess a host.
 *
 * Array query parameters (`Ids`, `TaskIds`) are OpenAPI 3.0 `in: query` arrays
 * with no `style`, i.e. the default form/explode serialisation: `Ids=1&Ids=2`.
 *
 * Rate limiting: HTTP 429 and 5xx are retried with exponential backoff.
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

/** The connection's account slug, or a thrown error naming it. */
export function accountOf(credentials: Credentials): string {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const account = typeof extra['account'] === 'string' ? extra['account'].trim() : ''
  if (!account) {
    throw Object.assign(
      new Error(
        'Birdview PSA connection has no account slug (credentials.extra.account); reconnect it.',
      ),
      { statusCode: 400, code: 'MISSING_ACCOUNT' },
    )
  }
  return account
}

export class BirdviewClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: `${apiOrigin(accountOf(credentials))}/api/v2`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      paramsSerializer: { indexes: null },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }
}

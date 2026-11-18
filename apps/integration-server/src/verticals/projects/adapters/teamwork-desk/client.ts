import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'

/**
 * Thin HTTP client for the Teamwork Spaces REST API.
 *
 * The API is scoped to the customer's site:
 *   https://{siteName}.teamwork.com/spaces/api/v1/
 *
 * The site URL is stored in `credentials.extra.siteUrl` (e.g.
 * `https://mycompany.teamwork.com`). The client appends `/spaces/api/v1` to
 * build the axios baseURL.
 *
 * Authentication: `Authorization: Bearer <apiKey>` where the key is stored
 * in `credentials.accessToken`.
 *
 * Pagination: the v1 list endpoints this adapter calls document no paging
 * or query parameters (Teamwork's Spaces v1 spec lists path params only), so
 * each returns the whole collection and the adapter pages it locally.
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

/** Derive the Spaces API base URL from credentials. */
function buildBaseUrl(credentials: Credentials): string {
  const siteUrl =
    (credentials.extra?.['siteUrl'] as string | undefined) ?? ''
  // Strip trailing slash, append the Spaces API path.
  const base = siteUrl.replace(/\/$/, '')
  return base ? `${base}/spaces/api/v1` : '/spaces/api/v1'
}

export class TeamworkSpacesClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: buildBaseUrl(credentials),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
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

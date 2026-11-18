import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_BASE_URL, BACKEND_HEADER } from './constants'

/**
 * Thin HTTP client for the Favro REST API.
 *
 * Auth is HTTP Basic: the account email (stored on `credentials.extra.email`)
 * as the username and the API token (`credentials.accessToken`) as the
 * password. Every organization-scoped route additionally requires an
 * `organizationId` header (from `credentials.extra.organizationId`); Favro
 * returns 400 when it is missing.
 *
 * List endpoints return `{ requestId, page, pages, limit, entities }` and page
 * via `?requestId=<id>&page=<n>` (0-based). Every response carries an
 * `X-Favro-Backend-Identifier` header, which must be echoed on the request
 * for a following page so it reaches the server process holding the cached
 * result (https://favro.com/developer/, "Routing"). {@link getPage} returns
 * it; single reads do not need it.
 */
export class FavroClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const email = typeof extra['email'] === 'string' ? extra['email'] : ''
    const organizationId =
      typeof extra['organizationId'] === 'string' ? extra['organizationId'] : ''
    const basic = Buffer.from(`${email}:${credentials.accessToken ?? ''}`).toString('base64')

    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Basic ${basic}`,
        organizationId,
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

  /**
   * One page of a paginated list, with the backend identifier that routes a
   * request for the next page. Pass `backendId` when fetching a page after
   * the first.
   */
  async getPage<T>(
    path: string,
    params: Record<string, unknown>,
    backendId?: string,
  ): Promise<{ data: T; backendId: string | undefined }> {
    return withRetry(async () => {
      const res = await this.http.get<T>(path, {
        params,
        ...(backendId ? { headers: { [BACKEND_HEADER]: backendId } } : {}),
      })
      const raw: unknown = (res.headers as Record<string, unknown> | undefined)?.[
        BACKEND_HEADER.toLowerCase()
      ]
      return { data: res.data, backendId: typeof raw === 'string' && raw ? raw : undefined }
    })
  }
}

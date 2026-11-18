/**
 * Deposco HTTP client.
 *
 * Every request goes to `https://api.deposco.com/latest/<path>` with the
 * access token as a bearer token (see `constants.ts` and `auth.ts`).
 *
 * List pages after the first are fetched by following the `href` of the
 * response's `links[rel=next]` verbatim (tag "Pagination"): "Don't construct
 * the `next` URL manually or modify the `searchId` parameter. Always use the
 * full `href` value returned in the response." The documented examples show
 * both absolute hrefs (`https://api.deposco.com/latest/facilities?searchId=…`)
 * and hrefs relative to the base (`/orders/customerOrders?pageSize=25`), so a
 * relative href is resolved against the base URL, and an absolute one must be
 * on the API's own origin: the bearer token is never sent anywhere else.
 */
import axios, { type AxiosInstance } from 'axios'
import { DEPOSCO_API_BASE } from './constants'
import { authHeader, isTokenExpired, refreshCredentials } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

const API_ORIGIN = new URL(DEPOSCO_API_BASE).origin

export class DeposcoClient {
  private http: AxiosInstance
  private credentials: Credentials

  constructor(credentials: Credentials) {
    this.credentials = credentials
    this.http = axios.create({
      baseURL: DEPOSCO_API_BASE,
      headers: {
        Authorization: authHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /**
   * Refresh an expiring token, then return the Authorization header for this
   * request. The header goes on each request, not onto
   * `defaults.headers.common`: axios merges the instance's own `headers` (set
   * at create time) over `common`, so a refreshed token written there would
   * never be sent.
   */
  private async ensureAuth(): Promise<{ headers: { Authorization: string } }> {
    if (isTokenExpired(this.credentials)) {
      this.credentials = await refreshCredentials(this.credentials)
    }
    return { headers: { Authorization: authHeader(this.credentials.accessToken) } }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const auth = await this.ensureAuth()
      const { data } = await this.http.get<T>(path, params ? { ...auth, params } : auth)
      return data
    })
  }

  /** GET a `links[rel=next]` href exactly as the API returned it. */
  async getNext<T>(href: string): Promise<T> {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) && new URL(href).origin !== API_ORIGIN) {
      throw new Error(`Deposco returned a next link on another origin: ${new URL(href).origin}`)
    }
    return withRetry(async () => {
      const auth = await this.ensureAuth()
      const { data } = await this.http.get<T>(href, auth)
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const auth = await this.ensureAuth()
      const { data } = await this.http.post<T>(path, body, auth)
      return data
    })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const auth = await this.ensureAuth()
      const { data } = await this.http.put<T>(path, body, auth)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      const auth = await this.ensureAuth()
      await this.http.delete(path, auth)
    })
  }
}

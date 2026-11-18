import axios, { type AxiosInstance } from 'axios'
import { BOXBERRY_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Boxberry HTTP client.
 *
 * All Boxberry API calls share the same endpoint (`/json.php`).  The operation
 * is selected via the `method` query parameter and the API token is passed as
 * the `token` query parameter on every request.
 *
 * GET  requests: token + method + optional filter params all as query params.
 * POST requests: token + method as query params; JSON body carries the payload.
 */
export class BoxberryClient {
  private http: AxiosInstance
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
    this.http = axios.create({
      baseURL: BOXBERRY_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /**
   * GET request — method + token sent as query parameters alongside any extras.
   */
  async get<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>('', {
        params: { token: this.token, method, ...params },
      })
      return data
    })
  }

  /**
   * POST request — method + token in query parameters; body carries the payload.
   */
  async post<T>(method: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(
        '',
        body,
        { params: { token: this.token, method } },
      )
      return data
    })
  }
}

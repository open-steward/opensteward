import axios, { type AxiosInstance } from 'axios'
import { CARGUS_API_BASE } from './constants'
import { subscriptionKeyHeader, bearerHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Low-level Cargus API client.
 *
 * The `sessionToken` field caches the short-lived Bearer token so that callers
 * can acquire it once (via `login`) and reuse it for the lifetime of the client
 * instance.  If no session token is available the client falls back to
 * subscription-key-only auth, which is sufficient for read operations.
 */
export class CargusClient {
  private http: AxiosInstance
  private sessionToken: string | undefined

  constructor(credentials: Credentials) {
    // `accessToken` stores the Azure API Management subscription key.
    // `refreshToken` (if present) carries a previously acquired session token.
    this.sessionToken = credentials.refreshToken ?? undefined

    this.http = axios.create({
      baseURL: CARGUS_API_BASE,
      headers: {
        'Ocp-Apim-Subscription-Key': subscriptionKeyHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })

    // Attach Bearer token if already available.
    if (this.sessionToken) {
      this.http.defaults.headers.common['Authorization'] = bearerHeader(this.sessionToken)
    }
  }

  /**
   * Acquire a session token via POST /LoginUser.
   * Stores the token on the instance for subsequent requests.
   */
  async login(username: string, password: string): Promise<void> {
    const token = await withRetry(async () => {
      const { data } = await this.http.post<string>('LoginUser', {
        UserName: username,
        Password: password,
      })
      return data
    })
    this.sessionToken = token ?? undefined
    if (this.sessionToken) {
      this.http.defaults.headers.common['Authorization'] = bearerHeader(this.sessionToken)
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}

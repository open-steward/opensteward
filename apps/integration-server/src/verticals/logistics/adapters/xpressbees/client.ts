import axios, { type AxiosInstance } from 'axios'
import { XPRESSBEES_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
import { requestToken, storedLogin } from './auth'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

function isUnauthorized(err: unknown): boolean {
  return (err as { response?: { status?: number } })?.response?.status === 401
}

/**
 * Every documented request after "Generate Token" carries
 * `AUTHORIZATION Bearer Token / Token <token>` (apidoc_v1.1.5.pdf). The
 * shared TokenRefresher renews the token ahead of the JWT's `exp` (see
 * auth.ts). If one is still refused with a 401 (a token with no readable
 * `exp`), the client logs in again from the stored email and password and
 * sends the call once more. Any other error is surfaced as it is.
 */
export class XpressbeesClient {
  private http: AxiosInstance

  constructor(private credentials: Credentials) {
    this.http = XpressbeesClient.build(credentials.accessToken)
  }

  private static build(token: string): AxiosInstance {
    return axios.create({
      baseURL: XPRESSBEES_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
  }

  private async send<T>(fn: (http: AxiosInstance) => Promise<T>): Promise<T> {
    try {
      return await withRetry(() => fn(this.http))
    } catch (err) {
      const login = storedLogin(this.credentials)
      if (!isUnauthorized(err) || !login) throw err
      const fresh = await requestToken(login.email, login.password)
      this.credentials = fresh
      this.http = XpressbeesClient.build(fresh.accessToken)
      return withRetry(() => fn(this.http))
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.send(async (http) => (await http.get<T>(path, { params })).data)
  }

  async post<T>(path: string, body: unknown, params?: Record<string, unknown>): Promise<T> {
    return this.send(async (http) => (await http.post<T>(path, body, { params })).data)
  }

  async delete(path: string): Promise<void> {
    await this.send(async (http) => {
      await http.delete(path)
    })
  }
}

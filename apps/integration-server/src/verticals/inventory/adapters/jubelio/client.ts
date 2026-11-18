/**
 * Jubelio API HTTP client.
 *
 * Auth flow: POST /login {email, password} → {token}
 * All subsequent requests: Authorization: <token>  (no "Bearer" prefix).
 * Pagination: page (1-based) + pageSize query params.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

interface LoginResponse {
  token?: string
}

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

export class JubelioClient {
  private http: AxiosInstance
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken ?? ''
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Version': '1.0.0',
      },
      timeout: 30_000,
    })
  }

  /**
   * Login with email + password, returning a fresh token string.
   * Call this when accessToken is empty or a 401 is received.
   */
  async login(email: string, password: string): Promise<string> {
    const { data } = await this.http.post<LoginResponse>('/login', { email, password })
    if (!data.token) throw new Error('jubelio /login returned no token')
    this.token = data.token
    return data.token
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params,
        headers: { Authorization: this.token },
      })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { Authorization: this.token },
      })
      return data
    })
  }
}

/**
 * Build a JubelioClient that is already authenticated.
 * If credentials.accessToken is empty we re-login using extra.email/password.
 */
export async function buildClient(credentials: Credentials): Promise<JubelioClient> {
  const client = new JubelioClient(credentials)
  if (!credentials.accessToken) {
    const email = String(credentials.extra?.['email'] ?? '')
    const password = String(credentials.extra?.['password'] ?? '')
    if (!email || !password) throw new Error('jubelio requires credentials.extra.email + password')
    await client.login(email, password)
  }
  return client
}

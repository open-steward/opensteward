/**
 * AdvancePro (APTX) REST API client.
 *
 * On construction the client checks if a valid JWT is stored.  If the stored
 * accessToken is the '__pending__' sentinel (or a known-expired token), it
 * first calls POST /api/Authenticate/login with the stored username + password
 * and stores the resulting token.
 *
 * Rate limiting: AdvancePro does not publish explicit rate limits; we apply a
 * simple exponential-backoff retry on 429 and 5xx.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, AUTH_PATH } from './constants'

interface AuthResponse {
  token?: string
  accessToken?: string
  refreshToken?: string
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

export class AdvanceProClient {
  private http: AxiosInstance
  private bearerToken: string

  constructor(credentials: Credentials) {
    const username = String(credentials.extra?.['username'] ?? '')
    const password = String(credentials.extra?.['password'] ?? '')
    if (!username || !password) {
      throw new Error('advance-pro requires credentials.extra.username + credentials.extra.password')
    }
    this.bearerToken = credentials.accessToken === '__pending__' ? '' : credentials.accessToken
    this.http = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30_000,
    })
    // Lazy auth: attach bearer before each request if available
    this.http.interceptors.request.use((config) => {
      if (this.bearerToken) {
        config.headers = config.headers ?? {}
        config.headers['Authorization'] = `Bearer ${this.bearerToken}`
      }
      config.headers = config.headers ?? {}
      config.headers['Accept'] = 'application/json'
      config.headers['Content-Type'] = 'application/json'
      return config
    })
    // Store for deferred login
    this._username = username
    this._password = password
  }

  private _username: string
  private _password: string

  private async ensureToken(): Promise<void> {
    if (this.bearerToken) return
    const res = await withRetry(async () => {
      const { data } = await this.http.post<AuthResponse>(AUTH_PATH, {
        username: this._username,
        password: this._password,
      })
      return data
    })
    const token = res.token ?? res.accessToken ?? ''
    if (!token) throw new Error('advance-pro: no token returned from /api/Authenticate/login')
    this.bearerToken = token
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    await this.ensureToken()
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    await this.ensureToken()
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}

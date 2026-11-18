import axios, { type AxiosInstance } from 'axios'
import { withRetry as withRetryBase } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'
import { SHIPPEO_API_BASE } from './constants'
import { authHeader, isTokenExpired, refreshCredentials } from './auth'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export class ShippeoClient {
  private http: AxiosInstance
  private credentials: Credentials

  constructor(credentials: Credentials) {
    this.credentials = credentials
    this.http = axios.create({
      baseURL: SHIPPEO_API_BASE,
      headers: {
        Authorization: authHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  private async ensureAuth(): Promise<void> {
    if (isTokenExpired(this.credentials)) {
      this.credentials = await refreshCredentials(this.credentials)
      this.http.defaults.headers.common['Authorization'] = authHeader(
        this.credentials.accessToken,
      )
    }
  }

  // ── HTTP verbs ──────────────────────────────────────────────────────────────

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      await this.ensureAuth()
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      await this.ensureAuth()
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      await this.ensureAuth()
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.ensureAuth()
      await this.http.delete(path)
    })
  }
}

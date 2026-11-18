import axios, { type AxiosInstance, AxiosError } from 'axios'
import { E2OPEN_API_BASE } from './constants'
import { authHeader, isTokenExpired, refreshCredentials } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export class E2openClient {
  private http: AxiosInstance
  private credentials: Credentials

  constructor(credentials: Credentials) {
    this.credentials = credentials
    this.http = axios.create({
      baseURL: E2OPEN_API_BASE,
      headers: {
        Authorization: authHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  private async ensureAuth(): Promise<void> {
    if (isTokenExpired(this.credentials)) {
      this.credentials = await refreshCredentials(this.credentials)
      this.http.defaults.headers.common['Authorization'] = authHeader(this.credentials.accessToken)
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      await this.ensureAuth()
      try {
        const { data } = await this.http.get<T>(path, { params })
        return data
      } catch (err) {
        if (err instanceof AxiosError && err.response?.status === 429) {
          const retryAfter = Number(err.response.headers['retry-after'] ?? 1)
          await new Promise((r) => setTimeout(r, retryAfter * 1000))
        }
        throw err
      }
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      await this.ensureAuth()
      try {
        const { data } = await this.http.post<T>(path, body)
        return data
      } catch (err) {
        if (err instanceof AxiosError && err.response?.status === 429) {
          const retryAfter = Number(err.response.headers['retry-after'] ?? 1)
          await new Promise((r) => setTimeout(r, retryAfter * 1000))
        }
        throw err
      }
    })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      await this.ensureAuth()
      try {
        const { data } = await this.http.put<T>(path, body)
        return data
      } catch (err) {
        if (err instanceof AxiosError && err.response?.status === 429) {
          const retryAfter = Number(err.response.headers['retry-after'] ?? 1)
          await new Promise((r) => setTimeout(r, retryAfter * 1000))
        }
        throw err
      }
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.ensureAuth()
      await this.http.delete(path)
    })
  }
}

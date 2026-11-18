import axios, { type AxiosInstance } from 'axios'
import { EXTENSIV_API_BASE } from './constants'
import { authHeader, isTokenExpired, refreshCredentials } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export class ExtensivClient {
  private http: AxiosInstance
  private credentials: Credentials

  constructor(credentials: Credentials) {
    this.credentials = credentials
    this.http = axios.create({
      baseURL: EXTENSIV_API_BASE,
      headers: {
        Authorization: authHeader(credentials.accessToken),
        'Content-Type': 'application/hal+json',
        Accept: 'application/hal+json',
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

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.ensureAuth()
      await this.http.delete(path)
    })
  }
}

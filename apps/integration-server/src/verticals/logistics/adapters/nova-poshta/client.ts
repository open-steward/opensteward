import axios, { type AxiosInstance } from 'axios'
import { withRetry as withRetryBase } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'
import { NOVA_POSHTA_API_BASE } from './constants'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Thin HTTP wrapper for the Nova Poshta API.
 * The Authorization header carries the short-lived JWT obtained from
 * GET /clients/authorization?apiKey={apiKey}.
 */
export class NovaPoshtaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: NOVA_POSHTA_API_BASE,
      headers: {
        Authorization: credentials.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
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

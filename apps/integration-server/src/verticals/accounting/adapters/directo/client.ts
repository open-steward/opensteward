/**
 * Directo REST client.
 *
 * Auth: API key in `X-Directo-Key` header.
 * Base: https://login.directo.ee/apidirect/v1/
 * Pagination: filter-based (timestamp `ts`); no limit/offset params.
 */
import axios, { type AxiosInstance } from 'axios'
import { DIRECTO_API_BASE, DIRECTO_API_KEY_HEADER } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class DirectoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: DIRECTO_API_BASE,
      headers: {
        [DIRECTO_API_KEY_HEADER]: credentials.accessToken,
        Accept: 'application/json',
        'Content-Type': 'application/json',
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

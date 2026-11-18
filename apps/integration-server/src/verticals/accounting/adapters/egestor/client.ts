import axios, { type AxiosInstance } from 'axios'
import { EGESTOR_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/**
 * Thin HTTP client for the eGestor REST API.
 * Auth: Bearer token (short-lived access_token, obtained by exchanging a
 * personal_token via POST /api/oauth/access_token).
 * Base URL: https://api.egestor.com.br/api/v1/
 * Rate limit: 60 req/min per application+user.
 */
export class EgestorClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: EGESTOR_API_BASE,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /**
   * GET /api/v1/{path}
   * eGestor paginated lists return: { total, per_page, current_page,
   * last_page, from, to, data: T[] }
   */
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

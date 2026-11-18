/**
 * Yooz Rising REST API HTTP client.
 *
 * Auth headers:
 *   Authorization: Bearer <accessToken>
 *   applicationId: <applicationId UUID from credentials.extra>
 *
 * Pagination: page (1-based) + pageSize query parameters.
 * Response envelope: { data: T[], totalCount: number, page: number, pageSize: number }
 */
import axios, { type AxiosInstance } from 'axios'
import { YOOZ_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class YoozClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const applicationId = String(credentials.extra?.['applicationId'] ?? '')
    this.http = axios.create({
      baseURL: `${YOOZ_API_BASE}/`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        applicationId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
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
}

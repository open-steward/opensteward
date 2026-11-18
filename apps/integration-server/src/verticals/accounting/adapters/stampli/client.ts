/**
 * Stampli HTTP client.
 *
 * Auth: static API key sent as a Bearer token in the `Authorization` header.
 * Company scope: `companyId` is stored in `credentials.extra.companyId` and
 * is included in endpoint paths that require it (e.g. /companies/{id}/invoices).
 *
 * Pagination: Stampli list endpoints return a `data` array with a `meta`
 * envelope:
 *   { data: T[], meta: { page, pageSize, totalCount, totalPages } }
 * Callers advance pages by passing `page` and `pageSize` as query parameters.
 */
import axios, { type AxiosInstance } from 'axios'
import { STAMPLI_API_BASE_PROD } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class StampliClient {
  private http: AxiosInstance
  readonly companyId: string

  constructor(credentials: Credentials, baseUrl = STAMPLI_API_BASE_PROD) {
    this.companyId = (credentials.extra?.['companyId'] as string | undefined) ?? ''
    this.http = axios.create({
      baseURL: `${baseUrl}/`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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

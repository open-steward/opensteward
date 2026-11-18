/**
 * AvidXchange HTTP client.
 *
 * Auth: static API key sent in the `x-api-key` header.
 * Company scope: `companyId` is stored in `credentials.extra.companyId` and
 * is included in every request path or query param as required by the API.
 *
 * Pagination: the AvidXchange API returns a `pagination` object:
 *   { pageNumber, pageSize, totalCount, totalPages }
 * Callers advance through pages by passing `pageNumber` and `pageSize` as
 * query parameters.
 */
import axios, { type AxiosInstance } from 'axios'
import { AVIDXCHANGE_API_BASE_PROD, AVIDXCHANGE_API_KEY_HEADER } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class AvidXchangeClient {
  private http: AxiosInstance
  readonly companyId: string

  constructor(credentials: Credentials, baseUrl = AVIDXCHANGE_API_BASE_PROD) {
    this.companyId = (credentials.extra?.['companyId'] as string | undefined) ?? ''
    this.http = axios.create({
      baseURL: `${baseUrl}/`,
      headers: {
        [AVIDXCHANGE_API_KEY_HEADER]: credentials.accessToken,
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

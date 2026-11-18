/**
 * Karbon HTTP client.
 *
 * Every request requires two headers:
 *   Authorization: Bearer <bearerToken>   (credentials.accessToken)
 *   AccessKey: <accessKey>                (credentials.extra.accessKey)
 *
 * Pagination: OData cursor — responses include @odata.nextLink.
 * Rate limit: 120 req/min; handled via withRetry on 429.
 */
import axios, { type AxiosInstance } from 'axios'
import { KARBON_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/** OData collection envelope returned by list endpoints. */
export interface ODataCollection<T> {
  'value': T[]
  '@odata.count'?: number
  '@odata.nextLink'?: string
}

export class KarbonClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const accessKey = (credentials.extra as Record<string, unknown> | undefined)?.['accessKey'] as string | undefined
    this.http = axios.create({
      baseURL: `${KARBON_API_BASE}/v3/`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        ...(accessKey ? { AccessKey: accessKey } : {}),
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

  async patch<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * Fetches a single page and returns both items and the nextLink cursor.
   * Callers pass `$top` and optionally `$skip` via `params`.
   */
  async list<T>(path: string, params?: Record<string, unknown>): Promise<ODataCollection<T>> {
    return this.get<ODataCollection<T>>(path, params)
  }
}

import axios, { type AxiosInstance } from 'axios'
import { buildBaseUrl, JSONAPI_CONTENT_TYPE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Thin HTTP client for the Webshipper JSON:API v2.
 * The account slug is resolved from credentials.extra.accountSlug.
 */
export class WebshipperClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const accountSlug = (extra.accountSlug as string | undefined) ?? ''
    const baseURL = buildBaseUrl(accountSlug)

    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': JSONAPI_CONTENT_TYPE,
        Accept: JSONAPI_CONTENT_TYPE,
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
}

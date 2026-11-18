/**
 * Bill4Time HTTP client.
 *
 * The API key is embedded in the base URL path; no Authorization header is
 * required.  All read routes support OData-style $top / $skip for pagination.
 */
import axios, { type AxiosInstance } from 'axios'
import { buildBaseUrl } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class Bill4TimeClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken
    this.http = axios.create({
      baseURL: `${buildBaseUrl(apiKey)}/`,
      headers: {
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

import axios, { type AxiosInstance } from 'axios'
import { BIGCAPITAL_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class BigcapitalClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // Self-hosted instances supply their base URL via credentials.extra.baseUrl.
    // Fall back to the Bigcapital cloud endpoint when no URL is provided.
    const baseURL =
      (credentials.extra?.['baseUrl'] as string | undefined) ?? BIGCAPITAL_API_BASE

    this.http = axios.create({
      baseURL,
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

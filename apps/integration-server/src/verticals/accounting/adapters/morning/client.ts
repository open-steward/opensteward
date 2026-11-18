import axios, { type AxiosInstance } from 'axios'
import { MORNING_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

function basicAuth(apiKey: string, apiSecret: string): string {
  return Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
}

export class MorningClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken
    const apiSecret = (credentials.extra?.['apiSecret'] as string) ?? ''
    this.http = axios.create({
      baseURL: `${MORNING_API_BASE}/`,
      headers: {
        Authorization: `Basic ${basicAuth(apiKey, apiSecret)}`,
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

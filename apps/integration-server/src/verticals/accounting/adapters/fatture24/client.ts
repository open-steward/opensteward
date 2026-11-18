import axios, { type AxiosInstance } from 'axios'
import { FATTURE24_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class Fatture24Client {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // Fatture24 uses `apiKey` header instead of Authorization: Bearer
    this.http = axios.create({
      baseURL: `${FATTURE24_API_BASE}/`,
      headers: {
        apiKey: credentials.accessToken,
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

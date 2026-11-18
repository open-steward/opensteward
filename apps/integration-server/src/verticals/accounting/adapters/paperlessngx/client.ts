import axios, { type AxiosInstance } from 'axios'
import { PAPERLESSNGX_DEFAULT_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class PaperlessNgxClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, baseUrl?: string) {
    this.http = axios.create({
      baseURL: `${baseUrl ?? PAPERLESSNGX_DEFAULT_BASE}/`,
      headers: {
        Authorization: `Token ${credentials.accessToken}`,
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

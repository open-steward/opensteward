import axios, { type AxiosInstance } from 'axios'
import { BOKIO_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class BokioClient {
  private http: AxiosInstance
  readonly companyId: string

  constructor(credentials: Credentials) {
    this.companyId = credentials.tenantId ?? ''
    this.http = axios.create({
      baseURL: BOKIO_API_BASE,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  private companyPath(path: string): string {
    return `companies/${this.companyId}/${path}`
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(this.companyPath(path), { params })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(this.companyPath(path), body)
      return data
    })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(this.companyPath(path), body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(this.companyPath(path))
    })
  }
}

import axios, { type AxiosInstance } from 'axios'
import { FATTURE_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class FattureCloudClient {
  private http: AxiosInstance
  readonly companyId: string

  constructor(credentials: Credentials) {
    const stored = credentials.extra?.['companyId']
    const companyId =
      credentials.tenantId ||
      (typeof stored === 'string' || typeof stored === 'number' ? String(stored) : '')
    if (!companyId) {
      throw new Error(
        'Fatture in Cloud company is missing from the connection; reconnect it so the company is recorded.',
      )
    }
    this.companyId = companyId
    this.http = axios.create({
      baseURL: `${FATTURE_API_BASE}/c/${this.companyId}/`,
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

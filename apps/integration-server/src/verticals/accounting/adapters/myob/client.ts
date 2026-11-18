import axios, { type AxiosInstance } from 'axios'
import { MYOB_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class MyobClient {
  private http: AxiosInstance
  readonly companyFileId: string

  constructor(credentials: Credentials) {
    this.companyFileId = credentials.tenantId ?? ''
    this.http = axios.create({
      baseURL: `${MYOB_API_BASE}/${this.companyFileId}/`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'x-myobapi-key': `${credentials.extra?.['apiKey'] ?? ''}`,
        'x-myobapi-version': 'v2',
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

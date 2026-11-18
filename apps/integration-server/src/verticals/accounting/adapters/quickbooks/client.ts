import axios, { type AxiosInstance } from 'axios'
import { QBO_API_BASE, QBO_MINOR_VERSION } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class QBOClient {
  private http: AxiosInstance
  private realmId: string

  constructor(credentials: Credentials) {
    const realmId = credentials.tenantId ?? ''
    if (!/^\d+$/.test(realmId)) {
      throw new Error(`Invalid QuickBooks realmId: must be numeric, got "${realmId}"`)
    }
    this.realmId = realmId
    this.http = axios.create({
      baseURL: `${QBO_API_BASE}/${this.realmId}/`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      params: { minorversion: QBO_MINOR_VERSION },
    })
  }

  async query<T>(sql: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>('query', { params: { query: sql } })
      return data
    })
  }

  async get<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path)
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}

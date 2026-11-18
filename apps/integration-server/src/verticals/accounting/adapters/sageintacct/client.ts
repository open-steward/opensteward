import axios, { type AxiosInstance } from 'axios'
import { INTACCT_OAUTH_AUTH_URL } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

// INTACCT_OAUTH_AUTH_URL is referenced for module completeness
void INTACCT_OAUTH_AUTH_URL

export class SageIntacctClient {
  private http: AxiosInstance
  readonly companyId: string

  constructor(credentials: Credentials) {
    this.companyId = credentials.tenantId ?? ''
    this.http = axios.create({
      baseURL: 'https://api.intacct.com/ia/xml/',
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

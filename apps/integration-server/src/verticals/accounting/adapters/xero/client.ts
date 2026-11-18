import axios, { type AxiosInstance } from 'axios'
import { XERO_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class XeroClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    if (credentials.tenantId) {
      headers['Xero-tenant-id'] = credentials.tenantId
    }
    this.http = axios.create({ baseURL: XERO_API_BASE, headers })
  }

  /**
   * `headers` exists because Xero's incremental-sync filter is a HEADER, not a
   * query parameter. Without this argument the adapter had nowhere to put
   * `If-Modified-Since`, so it went into `params` as `IFModifiedSince`, rode
   * the query string, and was discarded by Xero without comment — a filter
   * that looked implemented and returned every record.
   */
  async get<T>(
    path: string,
    params?: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, headers ? { params, headers } : { params })
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

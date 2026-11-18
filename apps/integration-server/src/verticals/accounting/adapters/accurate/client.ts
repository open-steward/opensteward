import axios, { type AxiosInstance } from 'axios'
import { ACCURATE_ACCOUNT_API_BASE, ACCURATE_DATA_API_PATH } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class AccurateClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // The Accurate API uses a two-tier URL structure:
    // - Account-level API (db-list, open-db): https://account.accurate.id/api
    // - Data-level API: {host}/accurate/api where host is returned by open-db.do
    // The dynamic host is stored in credentials.extra.host after opening a database.
    // If no host is available, fall back to the account-level API base.
    const host = credentials.extra?.['host'] as string | undefined
    const baseURL = host ? `${host}${ACCURATE_DATA_API_PATH}/` : `${ACCURATE_ACCOUNT_API_BASE}/`
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

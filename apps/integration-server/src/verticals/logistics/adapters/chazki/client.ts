import axios, { type AxiosInstance } from 'axios'
import { CHAZKI_BASE_URL, CHAZKI_AUTH_HEADER } from './constants'
import { enterpriseKeyHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Thin HTTP client for the Chazki REST API.
 *
 * Authentication: every request carries the `enterprise-key` header set to the
 * UUID API key provisioned by Chazki for the enterprise account.
 *
 * Base URL: https://us-central1-chazki-link.cloudfunctions.net/cf-custom-integrations/api/legacy/peru
 */
export class ChazkiClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: CHAZKI_BASE_URL,
      headers: {
        [CHAZKI_AUTH_HEADER]: enterpriseKeyHeader(credentials.accessToken),
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

  async patch<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}

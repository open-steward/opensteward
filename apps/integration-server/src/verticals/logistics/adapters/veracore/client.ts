import axios, { type AxiosInstance } from 'axios'
import { authHeader, buildBaseUrl, getDomain } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Thin HTTP client for the VeraCore REST API.
 *
 * Base URL: https://{domain}/VeraCore/Public.Api/api/
 *
 * Authentication: two-step flow — credentials are exchanged for a Bearer token
 * via POST /api/login; all subsequent requests send:
 *   Authorization: Bearer {token}
 */
export class VeraCoreClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const domain = getDomain(credentials)
    const baseURL = `${buildBaseUrl(domain)}/`

    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: authHeader(credentials.accessToken),
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

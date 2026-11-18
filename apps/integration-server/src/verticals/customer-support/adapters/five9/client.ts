/**
 * Five9Client — thin axios wrapper for the Five9 SCIM 2.0 REST API.
 *
 * Authentication: `Authorization: Bearer <token>` where the token is a
 * long-lived SCIM Bearer token generated in the Five9 Admin console.
 *
 * Five9 SCIM follows RFC 7644 pagination:
 *   - startIndex (1-based)
 *   - count (page size)
 * Responses are wrapped in a ListResponse envelope:
 *   { totalResults, startIndex, itemsPerPage, Resources: [...] }
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { SCIM_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class Five9Client {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: SCIM_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/scim+json, application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }
}

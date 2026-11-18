/**
 * TeamSupport HTTP client.
 *
 * Auth: HTTP Basic Auth — OrganizationID as username, APIToken as password.
 * All endpoints live under https://app.teamsupport.com/api/json/ and return JSON.
 * Pagination: query params pageNumber (1-based) and pageSize.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

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

export class TeamsupportClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const orgId = String(credentials.extra?.['orgId'] ?? '')
    if (!orgId) {
      throw new Error('teamsupport requires credentials.extra.orgId (Organization ID)')
    }
    const apiToken = credentials.accessToken
    // Build Basic auth header from base64(orgId:apiToken)
    const basicToken = Buffer.from(`${orgId}:${apiToken}`).toString('base64')

    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Basic ${basicToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
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

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}

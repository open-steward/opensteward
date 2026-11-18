/**
 * Frappe Helpdesk REST client.
 *
 * Auth: Authorization: token <api_key>:<api_secret>
 * Base URL: <siteUrl>/api/resource  (per-tenant; stored in credentials.extra.siteUrl)
 *
 * Pagination: offset-based via limit_start + limit_page_length
 *
 * Docs: https://docs.frappe.io/framework/user/en/api/rest
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { RESOURCE_PATH } from './constants'

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

export class FrappeHelpdeskClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const siteUrl = String(credentials.extra?.['siteUrl'] ?? '').replace(/\/$/, '')
    if (!siteUrl) {
      throw new Error('frappe-helpdesk requires credentials.extra.siteUrl')
    }
    const baseURL = `${siteUrl}${RESOURCE_PATH}`
    // accessToken is stored as "api_key:api_secret" (see auth.ts)
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `token ${credentials.accessToken}`,
        Accept: 'application/json',
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
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}

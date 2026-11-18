/**
 * CashCtrl HTTP client.
 *
 * Auth: HTTP Basic Authentication — API key as the username, empty password.
 * The org-specific subdomain determines the base URL (stored in credentials.extra.orgName).
 *
 * Docs: https://app.cashctrl.com/static/help/en/api/index.html
 */
import axios, { type AxiosInstance } from 'axios'
import { CASHCTRL_API_BASE } from './constants'
import { buildBasicAuthHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class CashCtrlClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const orgName = (credentials.extra as Record<string, string> | undefined)?.['orgName'] ?? ''
    this.http = axios.create({
      baseURL: `${CASHCTRL_API_BASE(orgName)}/`,
      headers: {
        Authorization: buildBasicAuthHeader(credentials.accessToken),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
    // CashCtrl write endpoints accept form-encoded bodies
    return withRetry(async () => {
      const { data } = await this.http.post<T>(
        path,
        params ? new URLSearchParams(params as Record<string, string>) : undefined,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
      return data
    })
  }

  async put<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(
        path,
        params ? new URLSearchParams(params as Record<string, string>) : undefined,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
      return data
    })
  }

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, { params })
    })
  }
}

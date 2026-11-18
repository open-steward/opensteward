/**
 * Dynamics 365 SCM — HTTP client.
 *
 * Wraps two API surfaces:
 *   • ODataClient  — standard F&O OData REST (Bearer = Entra access_token)
 *   • IvClient     — Inventory Visibility Add-in REST (Bearer = IV service token)
 *
 * Both clients retry on 429 and 5xx with exponential back-off.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { getODataBaseUrl, IV_SERVICE_BASE_URL } from './constants'

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

/** OData client for Finance & Operations entities (/data/ prefix). */
export class D365ODataClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const tenantHost = String(credentials.extra?.['tenantHost'] ?? '')
    this.http = axios.create({
      baseURL: getODataBaseUrl(tenantHost),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
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

  async getById<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path)
      return data
    })
  }
}

/** Inventory Visibility client for on-hand queries. */
export class D365IvClient {
  private http: AxiosInstance
  private environmentId: string

  constructor(credentials: Credentials) {
    const ivToken = String(credentials.extra?.['ivAccessToken'] ?? credentials.accessToken)
    this.environmentId = String(credentials.extra?.['environmentId'] ?? '')
    this.http = axios.create({
      baseURL: IV_SERVICE_BASE_URL,
      headers: {
        Authorization: `Bearer ${ivToken}`,
        'Api-Version': '1.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** POST /api/environment/{envId}/onhand/indexquery */
  async queryOnHand<T>(body: Record<string, unknown>): Promise<T> {
    const path = `/api/environment/${this.environmentId}/onhand/indexquery`
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}

/**
 * Verloop.io HTTP client.
 *
 * All Campaign API endpoints are POST with JSON bodies.
 * Auth is a bare token in the Authorization header (no "Bearer" prefix).
 * Base URL is per-tenant: https://<client_id>.verloop.io/api/v1
 *
 * Docs: https://help.verloop.io/knowledge-base/verloop-campaign-api/
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_TEMPLATE } from './constants'

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

export class VerloopClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const clientId = String(credentials.extra?.['clientId'] ?? '')
    if (!clientId) {
      throw new Error('verloop requires credentials.extra.clientId (subdomain)')
    }
    const baseURL = API_BASE_URL_TEMPLATE.replace('{clientId}', clientId)
    this.http = axios.create({
      baseURL,
      headers: {
        // Verloop uses a bare token — no "Bearer" prefix
        Authorization: credentials.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * POST to a Campaign API path with a JSON body.
   * All Verloop Campaign API endpoints are POST.
   */
  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body ?? {})
      return data
    })
  }
}

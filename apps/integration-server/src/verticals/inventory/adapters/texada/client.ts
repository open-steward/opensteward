/**
 * Texada CloudLink HTTP client.
 *
 * Auth flow:
 *   POST https://use-api.cloudlink.texadasoftware.com/v1/{tenant}/auth
 *     Header: x-api-key: <apiKey>
 *             Tenant: <tenant>
 *   → { accessToken: string }
 *
 * Subsequent requests:
 *   Header: Authorization: Bearer <accessToken>
 *   Header: Tenant: <tenant>
 *
 * Pagination: ?page=0&size=500 (zero-based, max 1000 per page).
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

interface AuthResponse {
  accessToken?: string
  access_token?: string
  token?: string
}

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

export class TexadaClient {
  private http: AxiosInstance
  private readonly tenant: string
  private readonly apiKey: string

  constructor(credentials: Credentials) {
    const tenant = String(credentials.extra?.['tenant'] ?? '')
    const apiKey = String(credentials.extra?.['apiKey'] ?? credentials.accessToken ?? '')
    if (!tenant) throw new Error('texada requires credentials.extra.tenant')
    if (!apiKey) throw new Error('texada requires credentials.extra.apiKey')
    this.tenant = tenant
    this.apiKey = apiKey

    this.http = axios.create({
      baseURL: `${API_BASE_URL}/${tenant}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Tenant: tenant,
      },
      timeout: 30_000,
    })
  }

  /** Exchange the API key for a short-lived bearer token. */
  private async fetchBearerToken(): Promise<string> {
    const { data } = await axios.post<AuthResponse>(
      `${API_BASE_URL}/${this.tenant}/auth`,
      {},
      {
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Tenant: this.tenant,
        },
        timeout: 15_000,
      },
    )
    const token = data.accessToken ?? data.access_token ?? data.token ?? ''
    if (!token) throw new Error('texada /auth did not return an access token')
    return token
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const bearer = await this.fetchBearerToken()
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params,
        headers: { Authorization: `Bearer ${bearer}` },
      })
      return data
    })
  }
}

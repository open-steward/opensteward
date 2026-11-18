import axios, { type AxiosInstance } from 'axios'
import { PAYHAWK_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/**
 * Payhawk HTTP client.
 *
 * Auth: X-Payhawk-ApiKey header (accessToken holds the raw API key).
 * All paths are relative to https://api.payhawk.io/api/v3/accounts/{accountId}/...
 *
 * The accountId is stored in credentials.tenantId (populated when the user
 * first connects via the Connect Link form; users can locate it in
 * Settings > Integrations > API Keys in the Payhawk portal).
 */
export class PayhawkClient {
  private http: AxiosInstance
  readonly accountId: string

  constructor(credentials: Credentials) {
    const accountId = (credentials.tenantId ?? credentials.extra?.['accountId'] ?? '') as string
    if (!accountId) {
      throw new Error('Payhawk: accountId is required (set in credentials.tenantId)')
    }
    this.accountId = accountId

    this.http = axios.create({
      baseURL: `${PAYHAWK_API_BASE}/accounts/${accountId}/`,
      headers: {
        'X-Payhawk-ApiKey': credentials.accessToken,
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

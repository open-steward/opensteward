/**
 * Cognigy Live Agent API client.
 *
 * Auth: `api_access_token` header.
 * Base URL and account ID are stored in credentials.extra
 * (`baseUrl`, `accountId`).
 *
 * All resource endpoints are under /api/v1/accounts/{accountId}/...
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_BASE_URL, API_V1 } from './constants'

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

export class CognigyClient {
  private http: AxiosInstance
  readonly accountPrefix: string

  constructor(credentials: Credentials) {
    const baseURL = (credentials.extra?.['baseUrl'] as string | undefined ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    const accountId = credentials.extra?.['accountId'] as string | undefined ?? ''
    this.accountPrefix = `${API_V1}/${accountId}`
    this.http = axios.create({
      baseURL,
      headers: {
        'api_access_token': credentials.accessToken,
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
}

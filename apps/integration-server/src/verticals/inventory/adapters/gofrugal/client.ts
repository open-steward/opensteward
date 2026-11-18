/**
 * GoFrugal RetailEasy HTTP client.
 *
 * Auth: X-Auth-Token header (static API key).
 * Base URL is per-installation and comes from credentials.extra.baseUrl.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_BASE_URL, API_PATH_PREFIX } from './constants'

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

export class GofrugalClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const rawBase = (credentials.extra?.['baseUrl'] as string | undefined) ?? DEFAULT_BASE_URL
    const baseURL = rawBase.replace(/\/+$/, '') + API_PATH_PREFIX

    this.http = axios.create({
      baseURL,
      headers: {
        'X-Auth-Token': credentials.accessToken,
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

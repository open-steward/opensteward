/**
 * Sphereon eIDAS Signature REST API client.
 *
 * Bearer-token auth + JSON. Retries 429 + 5xx with exponential backoff.
 *
 * The cloud gateway and the self-hosted microservice expose the same paths;
 * the base URL is selectable via `credentials.extra.baseUrl` (defaults to the
 * VDX cloud gateway). Sphereon's signature endpoints return bare objects /
 * bare arrays — there is no pagination envelope.
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

export class SphereonClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL = String(credentials.extra?.['baseUrl'] ?? API_BASE_URL)
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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

  async tryGet<T>(path: string, params?: Record<string, unknown>): Promise<T | undefined> {
    try {
      return await this.get<T>(path, params)
    } catch (err) {
      const axiosErr = err as AxiosError
      if (axiosErr.response?.status === 404) return undefined
      throw err
    }
  }
}

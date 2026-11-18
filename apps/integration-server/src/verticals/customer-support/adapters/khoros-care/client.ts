/**
 * Khoros Care HTTP client.
 *
 * Uses HTTP Basic Authentication (Authorization: Basic <base64>).
 * accessToken stores the pre-encoded base64 "username:password" string.
 * The base URL is per-instance: https://{instance}.response.lithium.com/api/v2
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_TEMPLATE } from './constants'
import { normaliseInstance } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

function resolveInstance(credentials: Credentials): string {
  // `companyKey` is what connections stored before the instance was collected.
  // Throws for a blank value or a host outside response.lithium.com.
  const extra = credentials.extra ?? {}
  const instance = normaliseInstance(extra['instance'] ?? extra['companyKey'])
  return instance
}

export class KhorosCareClient {
  private http: AxiosInstance
  /** The validated instance name, e.g. `acme` for acme.response.lithium.com. */
  readonly instance: string

  constructor(credentials: Credentials) {
    this.instance = resolveInstance(credentials)
    const baseURL = API_BASE_URL_TEMPLATE.replace('{instance}', this.instance)
    this.http = axios.create({
      baseURL,
      headers: {
        // accessToken holds the pre-encoded base64 "username:password" token
        Authorization: `Basic ${credentials.accessToken}`,
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

/**
 * InvGate Service Management — HTTP client.
 *
 * The API is tenant-hosted. The base URL is derived from instanceHost stored
 * in credentials.extra, e.g. acme.cloud.invgate.net -> https://acme.cloud.invgate.net
 *
 * Authentication: Authorization: Bearer <token>
 *
 * Docs: https://releases.invgate.com/service-desk/api/
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'

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

function baseUrlFromCredentials(credentials: Credentials): string {
  const instanceHost = (credentials.extra as Record<string, unknown> | undefined)?.['instanceHost']
  if (!instanceHost || typeof instanceHost !== 'string') {
    throw new Error('invgate-service-management: missing instanceHost in credentials.extra')
  }
  const host = instanceHost.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return `https://${host}`
}

export class InvGateClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL = baseUrlFromCredentials(credentials)
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

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}

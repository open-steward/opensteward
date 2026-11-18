/**
 * Digio REST API client.
 *
 * Authentication: HTTP Basic, base64(client_id:client_secret). JSON body
 * for POST.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_ORIGIN } from './constants'

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

function buildBasic(credentials: Credentials): string {
  const stored = String(credentials.accessToken ?? '')
  if (stored && stored.includes(':') === false && /^[A-Za-z0-9+/=]+$/.test(stored)) {
    // Already base64-encoded by exchangeApiKey.
    return stored
  }
  const clientId = String(credentials.extra?.['clientId'] ?? '')
  const clientSecret = String(credentials.extra?.['clientSecret'] ?? '')
  return Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

export class DigioClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const basic = buildBasic(credentials)
    this.http = axios.create({
      baseURL: API_ORIGIN,
      headers: {
        Authorization: `Basic ${basic}`,
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

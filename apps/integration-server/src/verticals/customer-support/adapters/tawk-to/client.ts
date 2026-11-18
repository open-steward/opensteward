/**
 * tawk.to REST API client.
 *
 * Auth: HTTP Basic Authentication — API key as the username, empty password.
 * The tawk.to REST API v1 is RPC-style: endpoints are POSTed with JSON bodies.
 * Responses wrap in { ok: boolean, total?: number, data?: T[] } for list calls
 * and return the resource object directly for single-resource calls.
 *
 * Docs: https://help.tawk.to/article/rest-api
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

/**
 * Encode credentials for HTTP Basic Auth: base64("apiKey:")
 * tawk.to uses the API key as the username with an empty password.
 */
function basicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`
}

export class TawkToClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: basicAuthHeader(credentials.accessToken),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * POST to an RPC endpoint.
   * tawk.to REST API v1 uses POST for all read operations.
   */
  async post<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}

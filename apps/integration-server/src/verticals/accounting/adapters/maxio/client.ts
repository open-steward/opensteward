import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '../../adapter/interface'
import { MAXIO_SUBDOMAIN_PATTERN } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      if (axiosErr.response?.status === 429 && i < retries) {
        // Maxio rate limit: 100/min — honour Retry-After header
        const retryAfter = axiosErr.response.headers?.['retry-after']
        const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, i) * 1000
        await new Promise((r) => setTimeout(r, delayMs))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class MaxioClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, subdomain: string) {
    if (!subdomain) {
      throw new Error(
        'Maxio connection is missing its site subdomain; reconnect it and enter the subdomain.',
      )
    }
    // The API key is sent to this host — never build it from an unvetted value.
    if (!MAXIO_SUBDOMAIN_PATTERN.test(subdomain)) {
      throw new Error(
        `Maxio site subdomain "${subdomain}" is not a valid chargify.com subdomain; reconnect it.`,
      )
    }
    this.http = axios.create({
      baseURL: `https://${subdomain}.chargify.com/`,
      headers: {
        // Maxio uses HTTP Basic Auth with API key as username and 'x' as password
        Authorization: `Basic ${Buffer.from(`${credentials.accessToken}:x`).toString('base64')}`,
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

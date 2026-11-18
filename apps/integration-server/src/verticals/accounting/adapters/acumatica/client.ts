import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { ACUMATICA_API_PATH } from './constants'
import { normaliseInstanceUrl } from './auth'
import type { Credentials } from '../../adapter/interface'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      if (axiosErr.response?.status === 429 && i < retries) {
        // Acumatica uses load-based limiting — honour Retry-After header if present
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

export class AcumaticaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const raw = credentials.extra?.['instanceUrl']
    if (typeof raw !== 'string' || !raw.trim()) {
      throw new Error(
        'Acumatica instance URL is missing from the connection; reconnect it so the site URL is recorded.',
      )
    }
    const instanceUrl = normaliseInstanceUrl(raw)
    this.http = axios.create({
      baseURL: `${instanceUrl}${ACUMATICA_API_PATH}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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

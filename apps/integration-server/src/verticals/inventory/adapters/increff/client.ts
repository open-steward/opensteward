import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { buildBaseUrl } from './constants'

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

export class IncreffClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const clientCode = String(credentials.extra?.['clientCode'] ?? '')
    const secretKey = String(credentials.extra?.['secretKey'] ?? '')
    if (!clientCode) throw new Error('increff requires credentials.extra.clientCode')
    if (!secretKey) throw new Error('increff requires credentials.extra.secretKey')
    this.http = axios.create({
      baseURL: buildBaseUrl(clientCode),
      headers: {
        'access-key': credentials.accessToken,
        'secret-key': secretKey,
        'Content-Type': 'application/json',
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
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}

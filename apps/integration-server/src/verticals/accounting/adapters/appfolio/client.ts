import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { APPFOLIO_API_VERSION } from './constants'
import type { Credentials } from '../../adapter/interface'

function getApiBase(credentials: Credentials): string {
  const database = credentials.extra?.database as string | undefined
  if (!database) throw new Error('AppFolio credentials missing database (subdomain)')
  return `https://${database}.appfolio.com/${APPFOLIO_API_VERSION}/`
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      if (axiosErr.response?.status === 429 && i < retries) {
        // Respect Retry-After header if present, else exponential backoff
        const retryAfter = axiosErr.response.headers['retry-after']
        const delay = retryAfter
          ? parseInt(retryAfter as string, 10) * 1000
          : Math.pow(2, i) * 1000
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class AppFolioClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: getApiBase(credentials),
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

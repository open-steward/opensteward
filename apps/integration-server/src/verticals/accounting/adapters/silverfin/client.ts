import axios, { type AxiosInstance, type AxiosError, type AxiosResponse } from 'axios'
import { SILVERFIN_API_BASE_URL } from './constants'
import type { Credentials } from '../../adapter/interface'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      if (axiosErr.response?.status === 429 && i < retries) {
        const retryAfter = (axiosErr.response as AxiosResponse).headers['retry-after']
        const delayMs = retryAfter ? parseFloat(retryAfter) * 1000 : Math.pow(2, i) * 1000
        await new Promise((r) => setTimeout(r, delayMs))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class SilverfinClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: SILVERFIN_API_BASE_URL,
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

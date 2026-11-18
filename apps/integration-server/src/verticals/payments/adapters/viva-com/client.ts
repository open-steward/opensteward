/**
 * Viva.com REST API client — thin axios wrapper.
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

/** An HTTP status with its body, for endpoints whose end signal is a 204. */
export interface VivaComResponse<T> {
  status: number
  data: T | undefined
}

export class VivaComClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** POST a JSON body with query parameters; returns the status too (204 = no content). */
  async search<T>(
    path: string,
    query: Record<string, unknown>,
    body: Record<string, unknown>,
  ): Promise<VivaComResponse<T>> {
    return withRetry(async () => {
      const res = await this.http.post<T>(path, body, { params: query })
      return { status: res.status, data: res.status === 204 ? undefined : res.data }
    })
  }
}

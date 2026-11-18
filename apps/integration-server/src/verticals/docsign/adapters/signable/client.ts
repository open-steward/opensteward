/**
 * Signable v1 REST API client.
 *
 * Auth is HTTP Basic with the API key as the username and a literal `x` as
 * the password: `Authorization: Basic base64("<apiKey>:x")`. The key lives
 * verbatim on `credentials.accessToken`.
 *
 * Lists paginate with `offset` (0-indexed) + `limit` (max 50) and return a
 * `{ http, offset, limit, total_<resource>, <resource>: [...] }` wrapper.
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

export class SignableClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // API key is the Basic-auth username; the password is a literal `x`.
    const basic = Buffer.from(`${credentials.accessToken ?? ''}:x`).toString('base64')
    this.http = axios.create({
      baseURL: API_BASE_URL,
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

  async put<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}

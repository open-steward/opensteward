/**
 * Flowmono eSign API client.
 *
 * Flowmono authenticates requests with a static Bearer token supplied via the
 * `Authorization` header. The tenant context (appId, apiClientId, subscriberId,
 * userId) must be passed in every request body; the client exposes a helper to
 * build that context object from stored credentials.
 *
 * All responses follow the envelope `{ succeeded, entity, error, message }`.
 *
 * API base: https://api.flowmono.com
 * Auth: apiKey in Authorization header (Bearer scheme)
 *
 * Docs: https://www.flowmono.com/en-US/api/e-sign
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

export interface FlowmonoContext {
  appId: string
  apiClientId: string
  subscriberId: number
  userId: string
  token: string
}

export class FlowmonoClient {
  private http: AxiosInstance
  readonly ctx: FlowmonoContext

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    const extra = credentials.extra ?? {}
    this.ctx = {
      appId: String(extra['appId'] ?? ''),
      apiClientId: String(extra['apiClientId'] ?? ''),
      subscriberId: Number(extra['subscriberId'] ?? 0),
      userId: String(extra['userId'] ?? ''),
      token,
    }
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${token}`,
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

/**
 * Dodo Payments REST API client — thin axios wrapper.
 *
 * Auth is a static API key sent as `Authorization: Bearer <key>`. Request
 * and response bodies are JSON. List endpoints return a `{ items: [...] }`
 * envelope and page with `page_size` (max 100) + zero-based `page_number`.
 *
 * The base URL depends on the key's environment, carried on
 * `credentials.extra.mode` ('test' | 'live'); see auth.ts / constants.ts.
 *
 * Docs: https://docs.dodopayments.com/api-reference/introduction
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { baseUrlForMode } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** Dodo list responses wrap rows in an `items` array. */
export interface DodoListResponse<T> {
  items: T[]
}

export class DodoPaymentsClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const mode = (credentials.extra?.['mode'] as string | undefined) ?? 'live'
    this.http = axios.create({
      baseURL: baseUrlForMode(mode),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  async list<T>(path: string, params?: Record<string, unknown>): Promise<DodoListResponse<T>> {
    return this.get<DodoListResponse<T>>(path, params)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.patch<T>(path, body)).data)
  }
}

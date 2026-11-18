/**
 * Circle Mint REST API client — thin axios wrapper.
 *
 * Auth: Bearer token (`Authorization: Bearer <API_KEY>`). Bodies are JSON.
 * Every response is wrapped in a `{ "data": ... }` envelope (see
 * {@link CircleEnvelope}). Lists are cursor-paginated: pass `pageSize` plus
 * `pageAfter` / `pageBefore` (the id of the last / first item seen).
 *
 * Mutating endpoints require an `idempotencyKey` (a UUID v4) in the request
 * body; replaying the same key returns the original response instead of
 * creating a duplicate. The client generates one per call when the caller has
 * not supplied it.
 *
 * Docs: https://developers.circle.com/circle-mint/getting-started-with-the-circle-apis
 */

import { randomUUID } from 'node:crypto'
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

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

/** Standard `{ data }` envelope returned by every Circle Mint endpoint. */
export interface CircleEnvelope<T> {
  data?: T
}

export class CircleClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, baseUrl?: string) {
    this.http = axios.create({
      baseURL: baseUrl ?? API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken ?? ''}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  /** POST a JSON body, auto-attaching an `idempotencyKey` when absent. */
  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const payload = { idempotencyKey: randomUUID(), ...(body ?? {}) }
    return withRetry(async () => (await this.http.post<T>(path, payload)).data)
  }
}

/**
 * Atome (apaylater) v2 REST client — thin axios wrapper.
 *
 * Auth is HTTP Basic: the Base64-encoded `username:password` token computed at
 * connect time is sent as `Authorization: Basic <token>`. Request and response
 * bodies are JSON.
 *
 * Atome has **no list/collection endpoint** — every payment is addressed by its
 * merchant-supplied `referenceId` — so there is no pagination to implement. The
 * base host is resolved from the environment the merchant selected at connect
 * time and stashed on `credentials.extra.environment`.
 *
 * Docs: https://doc.apaylater.com/v2/
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { baseUrlFor } from './constants'
import type { AtomeCredentialExtra } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const s = (err as AxiosError).response?.status
      if ((s === 429 || (s !== undefined && s >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class AtomeClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const extra = credentials.extra as Partial<AtomeCredentialExtra> | undefined
    this.http = axios.create({
      baseURL: baseUrlFor(extra?.environment),
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }
}

/**
 * Plaid REST API client — thin axios wrapper.
 *
 * Plaid authenticates with a `client_id` + `secret` pair. They may travel in
 * either the JSON body or the `PLAID-CLIENT-ID` / `PLAID-SECRET` headers; we
 * use the headers so the per-request body stays clean. Every endpoint is a
 * JSON `POST` (there are no GETs), so the client exposes a single `post`.
 *
 * Lists (`/transfer/list`) page with a numeric `offset` + `count` and return a
 * flat array with no cursor — the caller advances `offset` until a short page.
 *
 * Docs: https://plaid.com/docs/api/
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { baseUrlFor, clientId, secret } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
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

export class PlaidClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: baseUrlFor(credentials),
      headers: {
        'PLAID-CLIENT-ID': clientId(credentials),
        'PLAID-SECRET': secret(credentials),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** POST a JSON body to a Plaid endpoint and return the parsed response. */
  async post<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }
}

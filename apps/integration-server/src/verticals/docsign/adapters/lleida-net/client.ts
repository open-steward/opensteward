/**
 * Lleida.net Click & Sign REST API client.
 *
 * Click & Sign is a flat JSON API: every action is a POST to
 * `${API_BASE_URL}/<action>` with the action name (upper-cased) echoed in the
 * body's `request` field and the account `user` injected from
 * `credentials.extra.user`. Auth is `Authorization: x-api-key <apiKey>`.
 *
 * Responses share an envelope: `{ "code": 200, "status": "Success",
 * "request": "...", ... }` with the resource data alongside `code` at the top
 * level (no nested `result`). `code` 200 means success; anything else is an
 * application error and is surfaced as a thrown Error.
 *
 * Docs: https://api.lleida.net/dtd/clickandsign/v1/en/
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

/** Common envelope on every Click & Sign response. */
export interface ClickAndSignEnvelope {
  code: number
  status?: string
  request?: string
  request_id?: string
  [key: string]: unknown
}

export class LleidaNetClient {
  private http: AxiosInstance
  private user: string

  constructor(credentials: Credentials) {
    this.user = String(credentials.extra?.['user'] ?? '')
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `x-api-key ${credentials.accessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Invoke a Click & Sign action. `action` is the lower-cased endpoint segment
   * (e.g. `get_signature_list`); it is appended to the base path and echoed in
   * the body's `request` field upper-cased. The account `user` is injected
   * automatically. Returns the full response envelope.
   */
  async call<T extends ClickAndSignEnvelope>(
    action: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(`/${action}`, {
        user: this.user,
        request: action.toUpperCase(),
        ...(body ?? {}),
      })
      if (data && typeof data.code === 'number' && data.code !== 200) {
        throw new Error(
          `Click & Sign ${action.toUpperCase()} returned code ${data.code}: ${data.status ?? 'error'}`,
        )
      }
      return data
    })
  }
}

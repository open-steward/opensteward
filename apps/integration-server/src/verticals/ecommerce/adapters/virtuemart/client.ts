/**
 * VirtueMart HTTP client, used only by cancelOrder (a write left out of the
 * read rebuild). VirtueMart documents no REST API: see index.ts.
 *
 * Features:
 *  - API token auth via `Authorization: Bearer <token>` header.
 *  - `baseUrl` taken from `credentials.extra.baseUrl` (e.g. `https://mysite.example.com`).
 *  - Joomla component routing: `{baseUrl}/index.php?option=com_virtuemart&view=<view>&format=json`
 *  - Retries with exponential backoff on 429 and 5xx responses.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { JOOMLA_FORMAT, JOOMLA_OPTION } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class VirtueMartClient {
  private http: AxiosInstance
  readonly baseUrl: string

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    const base = credentials.extra?.['baseUrl'] as string | undefined

    if (!token) {
      throw new Error('VirtueMartClient: credentials.accessToken (API token) is required')
    }
    if (!base) {
      throw new Error(
        'VirtueMartClient: credentials.extra.baseUrl is required (e.g. https://mysite.example.com)',
      )
    }

    this.baseUrl = base.replace(/\/$/, '')
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Build a Joomla component URL for a given VirtueMart view.
   * e.g. view=products → /index.php?option=com_virtuemart&view=products&format=json
   */
  private joomlaParams(view: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      option: JOOMLA_OPTION,
      view,
      format: JOOMLA_FORMAT,
      ...extra,
    }
  }

  async post<T>(view: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>('/index.php', body, {
        params: this.joomlaParams(view),
      })
      return data
    })
  }
}

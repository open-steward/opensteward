/**
 * Bridge API client — thin axios wrapper.
 *
 * Every request carries the three headers
 * https://docs.bridgeapi.io/docs/basics.md names for "every endpoint":
 * `Client-Id`, `Client-Secret` and `Bridge-Version: 2025-01-15`.
 *
 * Lists answer `{ resources: [...], pagination: { next_uri } }`, where
 * `next_uri` is "the next call ... together with all the current pagination
 * parameters" and "Can be `null` if there are no more results in the list."
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, BRIDGE_VERSION } from './constants'
import { readAppCredentials } from './auth'

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

/** The documented list envelope (`paginated-result`). */
export interface BridgeListResponse<T> {
  resources?: T[]
  pagination?: { next_uri?: string | null }
}

/**
 * The `after` cursor inside a `next_uri`, or undefined when the list has
 * ended. The cursor is read from the URI Bridge built, never forged.
 */
export function nextAfter(nextUri: string | null | undefined): string | undefined {
  if (typeof nextUri !== 'string' || nextUri === '') return undefined
  const after = new URL(nextUri, API_BASE_URL).searchParams.get('after')
  return after === null || after === '' ? undefined : after
}

export class BridgeOpenBankingClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const { clientId, clientSecret } = readAppCredentials(credentials)
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Client-Id': clientId,
        'Client-Secret': clientSecret,
        'Bridge-Version': BRIDGE_VERSION,
        Accept: 'application/json',
        'Content-Type': 'application/json',
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
}

/**
 * Newegg Marketplace REST/JSON HTTP client.
 *
 * Auth uses custom headers: Authorization (API key) + SecretKey (secret key);
 * the seller ID travels in the `sellerid` query parameter. The base path
 * depends on `credentials.extra.marketplace` (us / can / b2b).
 * Newegg's API natively uses XML, but supports JSON via Accept/Content-Type
 * headers. We always request JSON.
 *
 * Retries follow exponential backoff on 429 and 5xx.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  BASE_URL,
  API_KEY_HEADER,
  SECRET_KEY_HEADER,
  CONTENT_TYPE,
  ACCEPT_TYPE,
  MARKETPLACE_BASE_PATHS,
  type NeweggMarketplace,
} from './constants'
import { getSellerId } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
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

function resolveBaseUrl(credentials: Credentials): string {
  const marketplace = (credentials.extra?.['marketplace'] as string | undefined) ?? 'us'
  if (!Object.prototype.hasOwnProperty.call(MARKETPLACE_BASE_PATHS, marketplace)) {
    throw new Error(
      `Newegg credentials have an unknown marketplace "${marketplace}" — reconnect and choose US, Canada or B2B.`,
    )
  }
  return `${BASE_URL}${MARKETPLACE_BASE_PATHS[marketplace as NeweggMarketplace]}`
}

export class NeweggClient {
  private http: AxiosInstance
  private apiKey: string
  private secretKey: string

  constructor(credentials: Credentials) {
    if (!credentials.accessToken) {
      throw new Error(
        'NeweggClient: credentials.accessToken (secret key) is required — the auth ' +
          'middleware should have validated credentials before instantiating the client.',
      )
    }
    this.secretKey = credentials.accessToken
    // Validates the seller ID is present; callers put it in `?sellerid=`.
    getSellerId(credentials)
    const apiKey = credentials.extra?.['apiKey'] as string | undefined
    if (!apiKey) {
      throw new Error(
        'Newegg credentials are missing the API key (credentials.extra.apiKey) — ' +
          'reconnect with your Newegg API key, secret key and seller ID.',
      )
    }
    this.apiKey = apiKey

    this.http = axios.create({
      baseURL: resolveBaseUrl(credentials),
      headers: {
        'Content-Type': CONTENT_TYPE,
        Accept: ACCEPT_TYPE,
      },
      timeout: 30_000,
    })
  }

  private requestHeaders(): Record<string, string> {
    return {
      [API_KEY_HEADER]: this.apiKey,
      [SECRET_KEY_HEADER]: this.secretKey,
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params,
        headers: this.requestHeaders(),
      })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: this.requestHeaders(),
      })
      return data
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, {
        headers: this.requestHeaders(),
      })
      return data
    })
  }

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, {
        params,
        headers: this.requestHeaders(),
      })
    })
  }
}

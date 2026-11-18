/**
 * GOFRUGAL RetailEasy WebReporter API client.
 *
 * Docs: https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/ecommerce-integration/api-integration/articles/api-integration
 *
 * Features:
 *  - Static `X-Auth-Token` header (the API key configured inside RetailEasy).
 *  - Base URL is the merchant's own normalised WebReporter address (see
 *    ./connect-form.ts) — there is no shared GOFRUGAL host.
 *  - `withRetry` from `@opensteward/shared` for 429/5xx back-off. Rate
 *    limits are not documented for this on-premises API; retrying is
 *    defensive rather than a response to a published limit.
 *
 * GOFRUGAL never reports a currency field (items, stock, or sales orders
 * alike) — RetailEasy is used well outside India too, so the transforms
 * cannot assume one. `currency` is read from the connection's own
 * credentials (collected once at connect time — see ./connect-form.ts) and
 * exposed here so every call site uses the same value; a connection saved
 * before that field existed fails loudly here rather than silently
 * mislabeling every price.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'

export class GofrugalClient {
  private http: AxiosInstance
  readonly currency: string

  constructor(credentials: Credentials) {
    const apiKey = (credentials.extra?.['apiKey'] as string | undefined) ?? credentials.accessToken
    const baseUrl = credentials.extra?.['baseUrl'] as string | undefined
    const currency = credentials.extra?.['currency'] as string | undefined
    if (!apiKey) {
      throw new Error('GofrugalClient: credentials.accessToken (apiKey) is required')
    }
    if (!baseUrl) {
      throw new Error(
        'GofrugalClient: credentials.extra.baseUrl is required (the merchant\'s WebReporter base URL)',
      )
    }
    if (!currency) {
      throw new Error(
        'GofrugalClient: credentials.extra.currency is required — GOFRUGAL reports no currency of ' +
          'its own, so this connection must record the one its RetailEasy deployment prices in ' +
          '(reconnect via the Connect Link form to set it).',
      )
    }
    this.currency = currency

    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        'X-Auth-Token': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      try {
        const { data } = await this.http.get<T>(path, { params })
        return data
      } catch (err) {
        throw normalizeError(err)
      }
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      try {
        const { data } = await this.http.post<T>(path, body)
        return data
      } catch (err) {
        throw normalizeError(err)
      }
    })
  }
}

/** Preserve the HTTP status on the thrown error so `withRetry` can see it. */
function normalizeError(err: unknown): Error {
  const axiosErr = err as AxiosError
  if (axiosErr?.isAxiosError) {
    const status = axiosErr.response?.status
    const message = `GOFRUGAL API error${status ? ` (${status})` : ''}: ${axiosErr.message}`
    const wrapped = new Error(message) as Error & { response?: { status?: number } }
    wrapped.response = { status }
    return wrapped
  }
  return err instanceof Error ? err : new Error(String(err))
}

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  DEFAULT_ENVIRONMENT,
  HEAD_CHANNEL_ID,
  HEAD_VERSION,
  HOSTS,
  MERCHANT_PASSBOOK_HOSTS,
  type PaytmEnvironment,
} from './constants'
import { generateSignature } from './checksum'

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

/** Standard Paytm `{ head, body }` response envelope. */
export interface PaytmEnvelope<T> {
  head?: {
    version?: string
    responseTimestamp?: string
    signature?: string
    [k: string]: unknown
  }
  body?: T
}

/** Per-call options for {@link PaytmClient.post}. */
export interface PaytmPostOptions {
  /**
   * Extra `head` fields merged on top of the default
   * `{ version, channelId, signature }` — e.g. `{ tokenType: 'CHECKSUM' }`
   * for the merchant-passbook list APIs, which authenticate with
   * `head.tokenType` (and, for refundList, an optional `head.clientId` for
   * multi-key merchants) rather than the legacy PG head shape. Merged
   * additively on top of the defaults: a collision would let the override
   * win, but none of the documented merchant-passbook head fields collide
   * with `version`/`channelId`.
   */
  head?: Record<string, unknown>
  /**
   * Skip the `{ head, body }` envelope unwrap and return the HTTP response
   * body verbatim. The Refund List API responds with a flat
   * `{ status, count, resultCode, errorMessage, orders }` — no envelope at
   * all — so the default `res.data.body ?? {}` unwrap would silently
   * collapse every response to `{}`.
   */
  raw?: boolean
}

/**
 * Paytm PG REST client.
 *
 * Auth is per-request: every POST sends a JSON envelope
 * `{ head: { signature, ... }, body }`, where `signature` is the Paytm
 * checksum of the `body` computed with the Merchant Key — unaffected by any
 * per-call `head` override, since only `body` is signed. There is no bearer
 * token. Most resources are fetched by id (order id / refund id); the
 * merchant-passbook APIs (Order List, Refund List) instead page over a
 * date window with `pageNumber`/`pageSize` — see {@link PaytmPostOptions}
 * for the header/envelope differences those two calls need.
 *
 * The MID is injected into the body by the caller; the merchant key
 * (`credentials.accessToken`) is used only to sign.
 */
export class PaytmClient {
  private http: AxiosInstance
  private merchantKey: string
  private env: PaytmEnvironment

  constructor(credentials: Credentials) {
    const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
    this.env = (extra.environment as PaytmEnvironment) ?? DEFAULT_ENVIRONMENT
    this.merchantKey = credentials.accessToken ?? ''
    this.http = axios.create({
      baseURL: HOSTS[this.env] ?? HOSTS[DEFAULT_ENVIRONMENT],
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Absolute URL for a merchant-passbook resource (Order List / Refund
   * List). Those endpoints are documented on a different host than this
   * client's `baseURL` (see `MERCHANT_PASSBOOK_HOSTS` in `./constants`);
   * passing an absolute URL to `post()` overrides axios's `baseURL` for
   * that one call, without needing a second `PaytmClient`/axios instance.
   */
  merchantPassbookUrl(path: string): string {
    return `${MERCHANT_PASSBOOK_HOSTS[this.env] ?? MERCHANT_PASSBOOK_HOSTS[DEFAULT_ENVIRONMENT]}${path}`
  }

  /** POST a signed `{ head: { signature }, body }` envelope and return its body. */
  async post<T>(path: string, body: Record<string, unknown>, options: PaytmPostOptions = {}): Promise<T> {
    const signature = generateSignature(body, this.merchantKey)
    const envelope = {
      head: {
        version: HEAD_VERSION,
        channelId: HEAD_CHANNEL_ID,
        signature,
        ...options.head,
      },
      body,
    }
    return withRetry(async () => {
      const res = await this.http.post<PaytmEnvelope<T> | T>(path, envelope)
      if (options.raw) return res.data as T
      return ((res.data as PaytmEnvelope<T>).body ?? ({} as T)) as T
    })
  }
}

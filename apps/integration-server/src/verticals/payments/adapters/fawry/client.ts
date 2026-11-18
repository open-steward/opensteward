/**
 * FawryPay server (ECommerceWeb) REST client — thin axios wrapper.
 *
 * Fawry is transaction-centric: charge and refund are POSTs of a JSON body
 * that embeds a per-request SHA-256 `signature`; the status inquiry is a GET
 * whose `signature` rides in the query string. There is NO list/cursor surface
 * — reads are point lookups by `merchantRefNumber` — so this client has no
 * pagination helper.
 *
 * Authentication is NOT a header credential: the `merchantCode` and the
 * computed `signature` are part of every request body / query. The signing
 * helpers below build those signatures from the merchant `secureKey`, which is
 * never transmitted.
 *
 * Docs: https://developer.fawrystaging.com/docs/server-apis/create-payment-refno-apis
 */
import { createHash } from 'node:crypto'
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { PRODUCTION_BASE_URL, STAGING_BASE_URL } from './constants'
import { environmentFrom } from './auth'

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

/** SHA-256 hex digest of the concatenated `parts` + the merchant secureKey. */
export function sha256Signature(parts: Array<string | undefined>, secureKey: string): string {
  const concatenated = parts.filter((p) => p != null && p !== '').join('') + secureKey
  return createHash('sha256').update(concatenated, 'utf8').digest('hex')
}

/**
 * Charge request signature:
 *   SHA-256( merchantCode + merchantRefNum + customerProfileId? +
 *            paymentMethod + amount(2dp) + secureKey )
 */
export function buildChargeSignature(
  input: {
    merchantCode: string
    merchantRefNum: string
    customerProfileId?: string
    paymentMethod: string
    amount: string
  },
  secureKey: string,
): string {
  return sha256Signature(
    [
      input.merchantCode,
      input.merchantRefNum,
      input.customerProfileId,
      input.paymentMethod,
      input.amount,
    ],
    secureKey,
  )
}

/**
 * Refund request signature:
 *   SHA-256( merchantCode + referenceNumber + refundAmount(2dp) + reason? +
 *            secureKey )
 */
export function buildRefundSignature(
  input: {
    merchantCode: string
    referenceNumber: string
    refundAmount: string
    reason?: string
  },
  secureKey: string,
): string {
  return sha256Signature(
    [input.merchantCode, input.referenceNumber, input.refundAmount, input.reason],
    secureKey,
  )
}

/**
 * Status (inquiry) request signature:
 *   SHA-256( merchantCode + merchantRefNumber + secureKey )
 */
export function buildStatusSignature(
  input: { merchantCode: string; merchantRefNumber: string },
  secureKey: string,
): string {
  return sha256Signature([input.merchantCode, input.merchantRefNumber], secureKey)
}

export class FawryClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const isProd = environmentFrom(credentials) === 'production'
    this.http = axios.create({
      baseURL: isProd ? PRODUCTION_BASE_URL : STAGING_BASE_URL,
      headers: {
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

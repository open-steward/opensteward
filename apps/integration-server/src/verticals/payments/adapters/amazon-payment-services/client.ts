/**
 * Amazon Payment Services (APS / PayFort) REST client.
 *
 * APS exposes one server-to-server endpoint — `/FortAPI/paymentApi` — that
 * accepts a JSON POST. The operation is chosen by the `command` /
 * `service_command` / `query_command` field in the body, NOT the path, and
 * authentication (`access_code` + `merchant_identifier` + `signature`) also
 * rides in the body. There is no token header, no list pagination, and no GET
 * collection endpoints, so the client is a thin signed-POST wrapper.
 *
 * Docs: https://paymentservices.amazon.com/docs/api
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { HOSTS, PAYMENT_API_PATH, type ApsEnvironment } from './constants'
import { readExtra } from './auth'
import { computeSignature } from './signature'

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

export class AmazonPaymentServicesClient {
  private http: AxiosInstance
  private accessCode: string
  private merchantIdentifier: string
  private requestPhrase: string
  private language: string
  private shaType: 'sha256' | 'sha512'

  constructor(credentials: Credentials) {
    const extra = readExtra(credentials)
    const env: ApsEnvironment = extra.environment
    this.accessCode = extra.accessCode
    this.merchantIdentifier = extra.merchantIdentifier
    this.requestPhrase = extra.requestPhrase
    this.language = extra.language
    this.shaType = extra.shaType
    this.http = axios.create({
      baseURL: HOSTS[env] ?? HOSTS.sandbox,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Send a signed command to the payment API. The caller passes the
   * operation-specific fields; this method injects `access_code`,
   * `merchant_identifier`, `language`, and the computed `signature`.
   */
  async command<T>(body: Record<string, unknown>): Promise<T> {
    const enriched: Record<string, unknown> = {
      access_code: this.accessCode,
      merchant_identifier: this.merchantIdentifier,
      language: this.language,
      ...body,
    }
    // Strip undefined/null so they don't enter the signed string.
    for (const k of Object.keys(enriched)) {
      if (enriched[k] === undefined || enriched[k] === null) delete enriched[k]
    }
    enriched.signature = computeSignature(enriched, this.requestPhrase, this.shaType)
    return withRetry(async () => (await this.http.post<T>(PAYMENT_API_PATH, enriched)).data)
  }
}

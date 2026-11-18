/**
 * Nuvei REST 1.0 client — thin axios wrapper.
 *
 * Nuvei is JSON-over-HTTPS POST with no bearer token: each request carries
 * `merchantId`, `merchantSiteId`, `clientRequestId`, `timeStamp`, and a
 * per-request SHA-256 `checksum` (see auth.ts). Paging, where an action has
 * it (getSubscriptionsList.do), rides in the request body and is built by the
 * adapter, not here. Callers pass the *ordered* checksum field values so the client can
 * sign the request without re-deriving the documented field order.
 *
 * Docs: https://docs.nuvei.com/documentation/accept-payment/server-to-server/rest-1-0/
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { randomUUID } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { baseUrlFor } from './constants'
import { computeChecksum, nuveiTimestamp, readExtra } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
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

/**
 * Envelope every Nuvei `.do` response shares.
 * `status` is the request-level outcome (SUCCESS / ERROR); `transactionStatus`
 * is the financial outcome (APPROVED / DECLINED / ERROR) on transaction calls.
 */
export interface NuveiResponseEnvelope {
  status?: string
  transactionStatus?: string
  errCode?: number
  reason?: string
  merchantId?: string
  merchantSiteId?: string
  version?: string
  clientRequestId?: string
  sessionToken?: string
  [key: string]: unknown
}

export class NuveiClient {
  private http: AxiosInstance
  private merchantId: string
  private merchantSiteId: string
  private merchantSecretKey: string

  constructor(credentials: Credentials) {
    const { merchantId, merchantSiteId, environment } = readExtra(credentials)
    this.merchantId = merchantId
    this.merchantSiteId = merchantSiteId
    this.merchantSecretKey = credentials.accessToken ?? ''
    this.http = axios.create({
      baseURL: baseUrlFor(environment),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * POST a signed Nuvei request.
   *
   * @param path           `.do` endpoint, e.g. `/refundTransaction.do`.
   * @param body           Method-specific fields (camelCase on the TS side maps
   *                       1:1 to Nuvei's camelCase wire fields).
   * @param checksumFields The *additional* field values, in the documented
   *                       order, that sit between the common prefix
   *                       (merchantId, merchantSiteId, clientRequestId) and the
   *                       common suffix (timeStamp). The client prepends and
   *                       appends those for you.
   */
  async post<T extends NuveiResponseEnvelope>(
    path: string,
    body: Record<string, unknown>,
    checksumFields: Array<string | number> = [],
  ): Promise<T> {
    const clientRequestId = String(body.clientRequestId ?? randomUUID())
    const timeStamp = nuveiTimestamp()

    // Checksum order for the standard transaction endpoints is:
    //   merchantId, merchantSiteId, clientRequestId, <method fields…>, timeStamp
    // followed by merchantSecretKey (appended inside computeChecksum).
    const ordered: Array<string | number> = [
      this.merchantId,
      this.merchantSiteId,
      clientRequestId,
      ...checksumFields,
      timeStamp,
    ]
    const checksum = computeChecksum(ordered, this.merchantSecretKey)

    const payload: Record<string, unknown> = {
      merchantId: this.merchantId,
      merchantSiteId: this.merchantSiteId,
      clientRequestId,
      timeStamp,
      checksum,
      ...body,
    }

    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, payload)
      return data
    })
  }

  /**
   * POST a request whose documented checksum is NOT the transaction shape
   * (merchantId, merchantSiteId, clientRequestId, …, timeStamp).
   *
   * The rebilling methods sign a different list and send no clientRequestId:
   * getPlansList's checksum is "merchantId, merchantSiteId, planIds, currency,
   * planStatus, timeStamp, merchantSecretKey" and its example request carries
   * merchantId, merchantSiteId, the filters, firstResult, maxResults,
   * timeStamp and checksum only —
   * https://docs.nuvei.com/api/advanced/indexAdvanced.html#getplanslist.
   *
   * @param checksumFields The optional method fields, in the documented order,
   *                       that sit between merchantSiteId and timeStamp. Per
   *                       the hashing guide, fields not sent are left out.
   * @param timeZoneOffsetHours Offset applied to the timeStamp (2 for GMT+2).
   */
  async postWithoutRequestId<T extends NuveiResponseEnvelope>(
    path: string,
    body: Record<string, unknown>,
    checksumFields: Array<string | number>,
    timeZoneOffsetHours: number,
  ): Promise<T> {
    const timeStamp = nuveiTimestamp(new Date(), timeZoneOffsetHours)
    const checksum = computeChecksum(
      [this.merchantId, this.merchantSiteId, ...checksumFields, timeStamp],
      this.merchantSecretKey,
    )
    const payload: Record<string, unknown> = {
      merchantId: this.merchantId,
      merchantSiteId: this.merchantSiteId,
      ...body,
      timeStamp,
      checksum,
    }
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, payload)
      return data
    })
  }

  /**
   * `getSessionToken` checksum order is exactly:
   *   merchantId, merchantSiteId, clientRequestId, timeStamp, merchantSecretKey
   * (no method-specific fields). Re-uses `post` with no extra checksum fields.
   */
  async getSessionToken(path: string): Promise<NuveiResponseEnvelope> {
    return this.post<NuveiResponseEnvelope>(path, {})
  }
}

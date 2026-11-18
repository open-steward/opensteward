/**
 * ShipEdge API client.
 *
 * Inventory v2: all requests are POST; auth params (account_id, key, warehouse)
 * are merged into the JSON body on every call.
 *
 * Replenishment v3: GET + POST with header-based HMAC auth:
 *   X-UID: account ID
 *   X-TIMESTAMP: YYYYMMDDHHmmSS
 *   X-KEY: SHA1(accountId + timestamp + rawKey)
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { createHash } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { inventoryBaseUrl, replenishmentBaseUrl } from './constants'

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

/** Generate a YYYYMMDDHHmmSS timestamp string for Replenishment v3 auth. */
function makeTimestamp(): string {
  const now = new Date()
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    String(now.getFullYear()) +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  )
}

export class ShipEdgeClient {
  private inventoryHttp: AxiosInstance
  private replenishmentHttp: AxiosInstance
  private apiKey: string
  private accountId: string
  private warehouse: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    this.accountId = String(credentials.extra?.['accountId'] ?? '')
    this.warehouse = String(credentials.extra?.['warehouse'] ?? '')
    const integration = String(credentials.extra?.['integration'] ?? '')

    if (!this.apiKey || !this.accountId || !this.warehouse || !integration) {
      throw new Error('shipedge requires credentials: apiKey, accountId, warehouse, integration')
    }

    this.inventoryHttp = axios.create({
      baseURL: inventoryBaseUrl(integration),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30_000,
    })

    this.replenishmentHttp = axios.create({
      baseURL: replenishmentBaseUrl(integration),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  /** Auth body params merged into every Inventory v2 request. */
  private authBody(): Record<string, unknown> {
    return {
      account_id: Number(this.accountId),
      key: this.apiKey,
      warehouse: this.warehouse,
    }
  }

  /** Auth headers for Replenishment v3 requests. */
  private authHeaders(): Record<string, string> {
    const ts = makeTimestamp()
    const xKey = createHash('sha1')
      .update(`${this.accountId}${ts}${this.apiKey}`)
      .digest('hex')
    return {
      'X-UID': this.accountId,
      'X-TIMESTAMP': ts,
      'X-KEY': xKey,
    }
  }

  /** POST to Inventory v2 — auth params merged into body. */
  async inventoryPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.inventoryHttp.post<T>(path, {
        ...this.authBody(),
        ...body,
      })
      return data
    })
  }

  /** GET from Replenishment v3 — auth in headers. */
  async replenishmentGet<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.replenishmentHttp.get<T>(path, {
        headers: this.authHeaders(),
      })
      return data
    })
  }
}

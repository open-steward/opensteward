import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  DEFAULT_ENVIRONMENT,
  HOSTS,
  REQUEST_TIMEOUT_MS,
  type JuspayEnvironment,
} from './constants'

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

/**
 * Juspay Express Checkout REST client.
 *
 * Auth is HTTP Basic with the API key as username and an empty password
 * (`Basic base64("<API_KEY>:")`), plus the static `x-merchantid` header on
 * every request. `x-routing-id` is per-call (a customer id when known), so it
 * is supplied by the adapter, not baked into the instance.
 *
 * Write endpoints (create order, create refund) accept
 * `application/x-www-form-urlencoded` bodies — including dotted keys such as
 * `metadata.description`. Reads are plain GETs. The resource surface is
 * order-scoped and has no cursor/offset list pagination.
 */
export class JuspayClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
    const env = (extra.environment as JuspayEnvironment) ?? DEFAULT_ENVIRONMENT
    const merchantId = String(extra.merchantId ?? '')
    const basic = Buffer.from(`${credentials.accessToken}:`).toString('base64')
    this.http = axios.create({
      baseURL: HOSTS[env] ?? HOSTS[DEFAULT_ENVIRONMENT],
      headers: {
        Authorization: `Basic ${basic}`,
        'x-merchantid': merchantId,
        Accept: 'application/json',
      },
      timeout: REQUEST_TIMEOUT_MS,
    })
  }

  /** GET a resource. `routingId` becomes the `x-routing-id` header. */
  async get<T>(path: string, routingId?: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params,
        headers: routingId ? { 'x-routing-id': routingId } : undefined,
      })
      return data
    })
  }

  /** POST a form-encoded body. `routingId` becomes the `x-routing-id` header. */
  async postForm<T>(path: string, body: Record<string, unknown>, routingId?: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, toForm(body), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(routingId ? { 'x-routing-id': routingId } : {}),
        },
      })
      return data
    })
  }
}

/**
 * Encode a body as `application/x-www-form-urlencoded`. Juspay expresses
 * nested structures with dotted keys (e.g. `metadata.description`), which the
 * caller passes pre-flattened; here we only stringify scalars and skip
 * null/undefined so optional fields are simply omitted.
 */
export function toForm(body: Record<string, unknown>): string {
  const out = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) {
    if (v === null || v === undefined) continue
    out.append(k, String(v))
  }
  return out.toString()
}

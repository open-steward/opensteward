import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { createHmac, randomBytes } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import {
  DEFAULT_ENVIRONMENT,
  HOSTS,
  JOSE_CONTENT_TYPE,
  JWS_ALG,
  type BilldeskEnvironment,
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

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

/**
 * Sign a JSON payload as a compact JWS (HMAC-SHA-256). BillDesk requires the
 * merchant `clientid` to be carried in the JWS protected header.
 */
export function signJws(payload: unknown, secretKey: string, clientId: string): string {
  const header = base64UrlEncode(JSON.stringify({ alg: JWS_ALG, clientid: clientId }))
  const body = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${header}.${body}`
  const signature = createHmac('sha256', secretKey).update(signingInput).digest('base64url')
  return `${signingInput}.${signature}`
}

/**
 * Decode a compact JWS BillDesk returns, recovering the JSON payload from the
 * middle segment. The HMAC is verified server-side already; the transport here
 * just extracts the body. Returns `{}` for an unparseable token so callers can
 * defensively transform.
 */
export function decodeJws(token: string): Record<string, unknown> {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return {}
    return JSON.parse(base64UrlDecode(parts[1]).toString('utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * BillDesk REST client.
 *
 * Every call is a POST whose body is a JWS-signed JSON token (`application/jose`)
 * and whose response is likewise a JWS token we decode back to JSON. The
 * `clientid` rides in `Credentials.extra`; the `secretkey` is the HMAC key
 * stored as `accessToken`. Each request carries a fresh idempotency/trace id
 * (`BD-Traceid`) and an epoch `BD-Timestamp`.
 */
export class BilldeskClient {
  private http: AxiosInstance
  private secretKey: string
  private clientId: string

  constructor(credentials: Credentials) {
    const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
    const env = (extra.environment as BilldeskEnvironment) ?? DEFAULT_ENVIRONMENT
    this.secretKey = credentials.accessToken ?? ''
    this.clientId = String(extra.clientId ?? '')
    this.http = axios.create({
      baseURL: HOSTS[env] ?? HOSTS[DEFAULT_ENVIRONMENT],
      headers: {
        'Content-Type': JOSE_CONTENT_TYPE,
        Accept: JOSE_CONTENT_TYPE,
      },
      // The body is a signed JWS string, not JSON — keep it untouched.
      transformRequest: [(data) => data],
      transformResponse: [(data) => data],
      timeout: 30_000,
    })
  }

  private traceId(): string {
    // Alphanumeric, no spaces/special chars, max 35 chars.
    return randomBytes(16).toString('hex')
  }

  /** Sign + POST `body`, then decode the JWS response into JSON. */
  async post<T>(path: string, body: unknown): Promise<T> {
    const jws = signJws(body, this.secretKey, this.clientId)
    return withRetry(async () => {
      const res = await this.http.post<string>(path, jws, {
        headers: {
          'BD-Traceid': this.traceId(),
          'BD-Timestamp': String(Date.now()),
        },
      })
      const raw = res.data
      return (typeof raw === 'string' ? decodeJws(raw) : (raw as unknown)) as T
    })
  }
}

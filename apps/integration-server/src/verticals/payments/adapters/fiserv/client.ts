/**
 * Fiserv Commerce Hub REST client — thin axios wrapper.
 *
 * Commerce Hub is a transaction-centric API: every operation is a POST whose
 * `requestType`-less body is signed with an HMAC-SHA256 message signature.
 * There is NO list/cursor surface — reads are point lookups via the
 * `transaction-inquiry` endpoint keyed by a reference transaction id — so this
 * client has no pagination helper.
 *
 * Per-request auth headers:
 *   Api-Key:           <apiKey>            (public identifier)
 *   Client-Request-Id: <uuid>             (idempotency / replay guard)
 *   Timestamp:         <unix-millis>
 *   Auth-Token-Type:   HMAC
 *   Authorization:     base64(HMAC-SHA256(apiKey + clientRequestId +
 *                                         timestamp + body, apiSecret))
 */
import { createHmac, randomUUID } from 'node:crypto'
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTH_TOKEN_TYPE, CERT_BASE_URL, PRODUCTION_BASE_URL } from './constants'
import { apiKeyFrom, apiSecretFrom, environmentFrom } from './auth'

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
 * Build the Commerce Hub message-signature header set for one request.
 * Exported for unit testing the signing scheme.
 */
export function buildSignatureHeaders(
  apiKey: string,
  apiSecret: string,
  body: string,
  clientRequestId: string = randomUUID(),
  timestamp: number = Date.now(),
): Record<string, string> {
  const rawSignature = `${apiKey}${clientRequestId}${timestamp}${body}`
  const signature = createHmac('sha256', apiSecret).update(rawSignature).digest('base64')
  return {
    'Api-Key': apiKey,
    'Client-Request-Id': clientRequestId,
    Timestamp: String(timestamp),
    'Auth-Token-Type': AUTH_TOKEN_TYPE,
    Authorization: signature,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

export class FiservClient {
  private http: AxiosInstance
  private apiKey: string
  private apiSecret: string

  constructor(credentials: Credentials) {
    this.apiKey = apiKeyFrom(credentials)
    this.apiSecret = apiSecretFrom(credentials)
    const isProd = environmentFrom(credentials) === 'production'
    this.http = axios.create({
      baseURL: isProd ? PRODUCTION_BASE_URL : CERT_BASE_URL,
      timeout: 30_000,
    })
  }

  /**
   * POST a JSON body to Commerce Hub. The body is serialized first so the
   * exact bytes that ship are the bytes that get signed.
   */
  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const serialized = JSON.stringify(body)
    return withRetry(async () => {
      const headers = buildSignatureHeaders(this.apiKey, this.apiSecret, serialized)
      const { data } = await this.http.post<T>(path, serialized, { headers })
      return data
    })
  }
}

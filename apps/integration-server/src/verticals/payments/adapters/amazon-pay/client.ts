/**
 * Amazon Pay API v2 REST client.
 *
 * Auth is per-request RSA signing (no bearer token, no pagination — every
 * resource is fetched by id). The Authorization header is built per the v2
 * scheme:
 *
 *   1. Build a canonical request: METHOD\nURI\nQUERY\nCANONICAL_HEADERS\n
 *      SIGNED_HEADERS\nSHA256(payload) (hex, lowercase).
 *   2. String-to-sign = "AMZN-PAY-RSASSA-PSS-V2\n" + SHA256(canonical request).
 *   3. Sign with RSASSA-PSS (SHA-256, salt length 32), base64-encode.
 *   4. Authorization: AMZN-PAY-RSASSA-PSS-V2 PublicKeyId=…, SignedHeaders=…,
 *      Signature=…
 *
 * Docs: https://developer.amazon.com/docs/amazon-pay-api-v2/signing-requests.html
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import {
  constants as cryptoConstants,
  createHash,
  createSign,
  randomUUID,
} from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { readCredentialExtra } from './auth'
import {
  API_VERSION,
  REGION_HOSTS,
  SIGNING_ALGORITHM,
  SIGNING_SALT_LENGTH,
  type AmazonPayEnvironment,
  type AmazonPayRegion,
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

/** ISO-8601 basic timestamp Amazon Pay expects, e.g. 20190923T231908Z. */
export function amazonPayDate(now: Date = new Date()): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

interface SignedRequest {
  method: 'GET' | 'POST' | 'DELETE'
  /** Path including the environment + version prefix, e.g. /live/v2/charges/x. */
  path: string
  region: AmazonPayRegion
  publicKeyId: string
  privateKey: string
  host: string
  payload: string
  date: string
  idempotencyKey?: string
}

/**
 * Build the canonical request + Authorization header. Exported for unit tests.
 */
export function buildAuthorizationHeader(req: SignedRequest): {
  authorization: string
  signedHeaders: string
} {
  // Headers that participate in the signature, lower-cased + sorted by name.
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-amz-pay-date': req.date,
    'x-amz-pay-host': req.host,
    'x-amz-pay-region': req.region,
  }
  if (req.idempotencyKey) headers['x-amz-pay-idempotency-key'] = req.idempotencyKey

  const sortedNames = Object.keys(headers).sort()
  const canonicalHeaders = sortedNames.map((n) => `${n}:${headers[n].trim()}\n`).join('')
  const signedHeaders = sortedNames.join(';')

  const canonicalRequest = [
    req.method,
    req.path,
    '', // canonical query string — never used (all gets are by id)
    canonicalHeaders,
    signedHeaders,
    sha256Hex(req.payload),
  ].join('\n')

  const stringToSign = `${SIGNING_ALGORITHM}\n${sha256Hex(canonicalRequest)}`

  const signer = createSign('RSA-SHA256')
  signer.update(stringToSign, 'utf8')
  const signature = signer.sign(
    {
      key: req.privateKey,
      padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
      saltLength: SIGNING_SALT_LENGTH,
    },
    'base64',
  )

  const authorization = `${SIGNING_ALGORITHM} PublicKeyId=${req.publicKeyId}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  return { authorization, signedHeaders }
}

export class AmazonPayClient {
  private http: AxiosInstance
  private region: AmazonPayRegion
  private environment: AmazonPayEnvironment
  private publicKeyId: string
  private privateKey: string
  private host: string

  constructor(credentials: Credentials) {
    const cred = readCredentialExtra(credentials)
    this.region = cred.region
    this.environment = cred.environment
    this.publicKeyId = cred.publicKeyId
    this.privateKey = cred.privateKey
    const baseURL = REGION_HOSTS[this.region]
    this.host = new URL(baseURL).host
    this.http = axios.create({ baseURL, timeout: 30_000 })
  }

  /** Build the `/{environment}/{version}{resourcePath}` request path. */
  private fullPath(resourcePath: string): string {
    return `/${this.environment}/${API_VERSION}${resourcePath}`
  }

  private sign(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    payload: string,
    idempotencyKey?: string,
  ): Record<string, string> {
    const date = amazonPayDate()
    const { authorization } = buildAuthorizationHeader({
      method,
      path,
      region: this.region,
      publicKeyId: this.publicKeyId,
      privateKey: this.privateKey,
      host: this.host,
      payload,
      date,
      idempotencyKey,
    })
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-amz-pay-date': date,
      'x-amz-pay-host': this.host,
      'x-amz-pay-region': this.region,
      authorization,
    }
    if (idempotencyKey) headers['x-amz-pay-idempotency-key'] = idempotencyKey
    return headers
  }

  async get<T>(resourcePath: string): Promise<T> {
    const path = this.fullPath(resourcePath)
    const headers = this.sign('GET', path, '')
    return withRetry(async () => (await this.http.get<T>(path, { headers })).data)
  }

  async post<T>(resourcePath: string, body: unknown): Promise<T> {
    const path = this.fullPath(resourcePath)
    const payload = body === undefined ? '' : JSON.stringify(body)
    const headers = this.sign('POST', path, payload, randomUUID())
    return withRetry(async () => (await this.http.post<T>(path, payload, { headers })).data)
  }

  /**
   * Amazon Pay's "cancel charge" verb is a DELETE that carries a JSON body —
   * axios sends it via the `data` option.
   */
  async delete<T>(resourcePath: string, body?: unknown): Promise<T> {
    const path = this.fullPath(resourcePath)
    const payload = body === undefined ? '' : JSON.stringify(body)
    const headers = this.sign('DELETE', path, payload, randomUUID())
    return withRetry(
      async () => (await this.http.delete<T>(path, { headers, data: payload })).data,
    )
  }
}

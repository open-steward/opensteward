import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { createHmac } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'

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
 * https://api-docs.solidgate.com/api/get-started: "The signature value is a
 * Base64-encoded string of the hexadecimal representation of an HMAC-SHA512
 * hash, created using the Secret key." The HMAC input is "publicKey +
 * jsonString + publicKey", and "For GET requests that do not have a body, the
 * signature data is simply publicKey + publicKey."
 */
export function solidgateSignature(
  publicKey: string,
  jsonString: string,
  secretKey: string,
): string {
  const hex = createHmac('sha512', secretKey)
    .update(publicKey + jsonString + publicKey)
    .digest('hex')
  return Buffer.from(hex).toString('base64')
}

/**
 * Solidgate answers some failures with HTTP 200 and an error body. The Reports
 * endpoints and POST /status document a 200 "Authentication failed" response,
 * `{ "error": { "code": "1.01", "messages": ["Authentication failed"] } }`
 * ("Unauthorized access due to invalid credentials."), and /status also
 * documents "Error 2.01 Order not found",
 * `{ "error": { "code": "2.01", "messages": { "order": ["Order not found."] } } }`
 * (https://api-docs.solidgate.com/_bundle/api/@v1/index.json?download,
 * responses["200"]). Such a POST body is thrown, never read as an empty result.
 */
export class SolidgateApiError extends Error {
  readonly statusCode: number
  readonly code: string
  constructor(
    readonly solidgateCode: string,
    readonly messages: unknown,
  ) {
    super(`Solidgate error ${solidgateCode}: ${JSON.stringify(messages)}`)
    this.statusCode = solidgateCode === '1.01' ? 401 : 502
    this.code = solidgateCode === '1.01' ? 'UNAUTHORIZED' : 'UPSTREAM_ERROR'
  }
}

function rejectErrorBody<T>(data: T): T {
  const err = (data as { error?: { code?: unknown; messages?: unknown } } | null)?.error
  if (err && typeof err === 'object' && err.code !== undefined) {
    throw new SolidgateApiError(String(err.code), err.messages)
  }
  return data
}

export class SolidgateClient {
  private http: AxiosInstance
  private publicKey: string
  private secretKey: string

  constructor(credentials: Credentials, baseURL: string) {
    const secret = credentials.extra?.['secretKey']
    if (!credentials.accessToken || typeof secret !== 'string' || !secret) {
      throw Object.assign(
        new Error(
          'Solidgate signs every request with the Secret key, and this connection has none. Reconnect with both the Public and the Secret key.',
        ),
        { statusCode: 401 },
      )
    }
    this.publicKey = credentials.accessToken
    this.secretKey = secret
    this.http = axios.create({
      baseURL,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 30_000,
    })
  }

  private headers(jsonString: string): Record<string, string> {
    return {
      merchant: this.publicKey,
      signature: solidgateSignature(this.publicKey, jsonString, this.secretKey),
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(
      // The Subscriptions GETs document real 401/404 statuses, not a 200 error body.
      async () => (await this.http.get<T>(path, { params, headers: this.headers('') })).data,
    )
  }

  /** The body is serialised once, so the bytes sent are the bytes signed. */
  async post<T>(path: string, body: unknown): Promise<T> {
    const json = JSON.stringify(body)
    return withRetry(async () =>
      rejectErrorBody((await this.http.post<T>(path, json, { headers: this.headers(json) })).data),
    )
  }
}

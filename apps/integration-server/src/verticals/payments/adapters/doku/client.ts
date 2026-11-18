import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  buildSignature,
  clientIdOf,
  digestOf,
  dokuRequestId,
  dokuTimestamp,
  environmentOf,
  secretKeyOf,
} from './auth'
import { baseUrlFor } from './constants'

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
 * Thin HTTP client for the DOKU (Jokul) REST API.
 *
 * DOKU authenticates each request with a `Client-Id` header plus an HMAC-SHA256
 * `Signature` derived from the request-target and (for POST) a SHA-256 digest
 * of the JSON body. The base URL depends on the configured environment
 * (sandbox vs production).
 *
 * The endpoints this adapter uses are single-resource (create one checkout,
 * read one order by invoice number, issue one refund), so there is no
 * cursor/offset pagination to thread.
 */
export class DokuClient {
  private http: AxiosInstance
  private clientId: string
  private secretKey: string

  constructor(credentials: Credentials) {
    this.clientId = clientIdOf(credentials)
    this.secretKey = secretKeyOf(credentials)
    this.http = axios.create({
      baseURL: baseUrlFor(environmentOf(credentials)),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Headers common to every signed request. `requestTarget` is the path used
   *  in the signature; for GETs with no body the digest line is omitted. */
  private signedHeaders(requestTarget: string, body?: string): Record<string, string> {
    const requestId = dokuRequestId()
    const requestTimestamp = dokuTimestamp()
    const digest = body ? digestOf(body) : undefined
    const signature = buildSignature({
      clientId: this.clientId,
      requestId,
      requestTimestamp,
      requestTarget,
      digest,
      secretKey: this.secretKey,
    })
    return {
      'Client-Id': this.clientId,
      'Request-Id': requestId,
      'Request-Timestamp': requestTimestamp,
      Signature: signature,
    }
  }

  async get<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        headers: this.signedHeaders(path),
      })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      // The digest must hash the exact bytes that are sent, so serialize once.
      const serialized = body === undefined ? '' : JSON.stringify(body)
      const { data } = await this.http.post<T>(path, serialized, {
        headers: this.signedHeaders(path, serialized),
      })
      return data
    })
  }
}

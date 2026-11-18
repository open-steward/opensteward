/**
 * Rapyd REST API client — axios wrapper with per-request HMAC signing.
 *
 * Rapyd authenticates every call with a signature, not a bearer token. For
 * each request we compute:
 *
 *   to_sign   = http_method + url_path + salt + timestamp
 *             + access_key + secret_key + body_string
 *   signature = BASE64( HEX( HMAC-SHA256( to_sign, key = secret_key ) ) )
 *
 * where:
 *   - http_method  is lower-case ('get', 'post', …)
 *   - url_path     starts at '/v1' and includes the query string
 *   - salt         is a fresh random hex string per request
 *   - timestamp    is Unix time in seconds (must be within 60s of Rapyd's clock)
 *   - body_string  is '' for GET / empty bodies, else the exact JSON we send
 *
 * The hex→base64 double-encoding is mandatory: base64-ing the raw digest fails
 * Rapyd's check. Lists are paginated by passing the last seen id as
 * `ending_before` (Rapyd returns newest-first) with a `has_more` flag.
 *
 * Docs: https://docs.rapyd.net/en/request-signatures.html
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { createHmac, randomBytes } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { API_PREFIX } from './constants'
import { accessKey, baseUrlFor, secretKey } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** Standard Rapyd response envelope. `data` is the resource or array. */
export interface RapydEnvelope<T> {
  status?: {
    error_code?: string
    status?: string
    response_code?: string
    operation_id?: string
    message?: string
  }
  data?: T
}

/** Serialize query params into a `?…` suffix using Rapyd's expected encoding. */
function queryString(params?: Record<string, unknown>): string {
  if (!params) return ''
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    usp.append(k, String(v))
  }
  const qs = usp.toString()
  return qs ? `?${qs}` : ''
}

export class RapydClient {
  private http: AxiosInstance
  private accessKey: string
  private secretKey: string

  constructor(credentials: Credentials) {
    this.accessKey = accessKey(credentials)
    this.secretKey = secretKey(credentials)
    this.http = axios.create({
      baseURL: `${baseUrlFor(credentials)}${API_PREFIX}`,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  /**
   * Compute the signed headers for one request. `path` is the resource path
   * *with* its query string but *without* the `/v1` prefix; `bodyString` is the
   * exact serialized body ('' for GET).
   */
  private sign(method: string, path: string, bodyString: string): Record<string, string> {
    const salt = randomBytes(8).toString('hex')
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const urlPath = `${API_PREFIX}${path}`
    const toSign =
      method.toLowerCase() + urlPath + salt + timestamp + this.accessKey + this.secretKey + bodyString
    const digestHex = createHmac('sha256', this.secretKey).update(toSign).digest('hex')
    const signature = Buffer.from(digestHex).toString('base64')
    return {
      access_key: this.accessKey,
      salt,
      timestamp,
      signature,
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<RapydEnvelope<T>> {
    const pathWithQuery = `${path}${queryString(params)}`
    const headers = this.sign('get', pathWithQuery, '')
    return withRetry(async () => {
      const { data } = await this.http.get<RapydEnvelope<T>>(pathWithQuery, { headers })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<RapydEnvelope<T>> {
    const bodyString = body ? JSON.stringify(body) : ''
    const headers = this.sign('post', path, bodyString)
    return withRetry(async () => {
      // Send the exact bytes we signed; axios would re-serialize an object, so
      // pass the pre-stringified JSON.
      const { data } = await this.http.post<RapydEnvelope<T>>(path, bodyString || undefined, {
        headers,
      })
      return data
    })
  }

  async delete<T>(path: string): Promise<RapydEnvelope<T>> {
    const headers = this.sign('delete', path, '')
    return withRetry(async () => {
      const { data } = await this.http.delete<RapydEnvelope<T>>(path, { headers })
      return data
    })
  }
}

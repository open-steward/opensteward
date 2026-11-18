/**
 * iFirma HTTP client.
 *
 * Authentication scheme: HMAC-SHA1 symmetric key
 *
 *   Header:  Authentication: IAPIS user=<login>, hmac-sha1=<hash>
 *   Hash:    hmac_sha1(rawKey, url + login + keyName + requestBody)
 *   rawKey:  hex key bytes decoded from the user's panel key
 *
 * The hex key stored in the ifirma panel (e.g. "EAB0D8ACF3308F3B") must be
 * decoded to raw bytes before being used as the HMAC key — each pair of hex
 * characters becomes one byte.
 *
 * Docs: https://api.ifirma.pl/naglowek-autoryzacji/
 */

import { createHmac } from 'node:crypto'
import axios, { type AxiosInstance } from 'axios'
import { IFIRMA_API_BASE } from './constants'
import { decodeCredentials } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/** Convert hex string to raw byte Buffer (each pair of hex chars → one byte). */
function hexToBytes(hex: string): Buffer {
  if (hex.length % 2 !== 0) hex = '0' + hex
  return Buffer.from(hex, 'hex')
}

/**
 * Compute the iFirma HMAC-SHA1 hash.
 *
 * message = url + login + keyName + requestBody
 * key     = raw bytes decoded from the hex API key
 */
function computeHmac(hexKey: string, message: string): string {
  const key = hexToBytes(hexKey)
  return createHmac('sha1', key).update(message, 'utf8').digest('hex')
}

/** Build the Authentication header value. */
function buildAuthHeader(
  url: string,
  login: string,
  keyName: string,
  hexKey: string,
  body: string,
): string {
  const hash = computeHmac(hexKey, url + login + keyName + body)
  return `IAPIS user=${login}, hmac-sha1=${hash}`
}

export class IfirmaClient {
  private login: string
  private apiKey: string

  constructor(credentials: Credentials) {
    const decoded = decodeCredentials(credentials)
    this.login = decoded.login
    this.apiKey = decoded.apiKey
  }

  private buildHttp(path: string, keyName: string, body = ''): AxiosInstance {
    const url = `${IFIRMA_API_BASE}/${path}`
    const authHeader = buildAuthHeader(url, this.login, keyName, this.apiKey, body)
    return axios.create({
      baseURL: IFIRMA_API_BASE,
      headers: {
        Authentication: authHeader,
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, keyName: string, params?: Record<string, unknown>): Promise<T> {
    // Hash uses the URL *without* query parameters (per ifirma docs)
    const http = this.buildHttp(path, keyName, '')
    return withRetry(async () => {
      const { data } = await http.get<T>(`/${path}`, { params })
      return data
    })
  }

  async post<T>(path: string, keyName: string, body: unknown): Promise<T> {
    const bodyStr = JSON.stringify(body)
    const http = this.buildHttp(path, keyName, bodyStr)
    return withRetry(async () => {
      const { data } = await http.post<T>(`/${path}`, bodyStr)
      return data
    })
  }

  async put<T>(path: string, keyName: string, body: unknown): Promise<T> {
    const bodyStr = JSON.stringify(body)
    const http = this.buildHttp(path, keyName, bodyStr)
    return withRetry(async () => {
      const { data } = await http.put<T>(`/${path}`, bodyStr)
      return data
    })
  }
}

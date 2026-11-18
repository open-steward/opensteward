import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  PRODUCTION_API_BASE_URL,
  STAGING_API_BASE_URL,
  DO_WEB_TRANS_PATH,
  API_VERSION,
  REQUEST_TYPE,
  RESPONSE_TYPE,
} from './constants'
import { accessCodeFrom, environmentFrom, workingKeyFrom } from './auth'
import { encrypt, decrypt } from './crypto'

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

/** Parse a `key=value&key=value` DoWebTrans reply into a flat record. */
function parseFormReply(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of body.split('&')) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    const key = pair.slice(0, eq)
    const value = pair.slice(eq + 1)
    out[key] = decodeURIComponent(value)
  }
  return out
}

/**
 * CCAvenue DoWebTrans client.
 *
 * There is no REST resource path and no cursor pagination — every operation is
 * a form-POST to the single `DoWebTrans` servlet with a `command` selector and
 * an AES-encrypted `enc_request` payload. The reply is a urlencoded
 * `status=…&enc_response=…` envelope whose `enc_response` we decrypt with the
 * same working key. `status=1` signals an error and `enc_response` is then a
 * plaintext message rather than ciphertext.
 */
export class CcavenueClient {
  private http: AxiosInstance
  private accessCode: string
  private workingKey: string

  constructor(credentials: Credentials) {
    this.accessCode = accessCodeFrom(credentials)
    this.workingKey = workingKeyFrom(credentials)
    const baseURL =
      environmentFrom(credentials) === 'production'
        ? PRODUCTION_API_BASE_URL
        : STAGING_API_BASE_URL
    this.http = axios.create({
      baseURL,
      headers: {
        Accept: 'text/plain',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 30_000,
    })
  }

  /**
   * Run a DoWebTrans command. The `payload` is JSON-stringified, AES-encrypted
   * into `enc_request`, and posted. The decrypted JSON response is returned, or
   * an Error is thrown when CCAvenue reports `status=1`.
   */
  async command<T>(command: string, payload: Record<string, unknown>): Promise<T> {
    const encRequest = encrypt(JSON.stringify(payload), this.workingKey)
    const body = new URLSearchParams({
      enc_request: encRequest,
      access_code: this.accessCode,
      command,
      request_type: REQUEST_TYPE,
      response_type: RESPONSE_TYPE,
      version: API_VERSION,
    }).toString()

    const raw = await withRetry(async () => {
      const res = await this.http.post<string>(DO_WEB_TRANS_PATH, body)
      return typeof res.data === 'string' ? res.data : String(res.data)
    })

    const fields = parseFormReply(raw)
    const status = fields['status']
    const encResponse = fields['enc_response'] ?? ''

    if (status === '1') {
      // Error path: enc_response is plaintext, not ciphertext.
      throw new Error(
        `CCAvenue ${command} failed (error_code=${fields['enc_error_code'] ?? ''}): ${encResponse}`,
      )
    }

    const plain = encResponse ? decrypt(encResponse, this.workingKey) : ''
    if (!plain) return {} as T
    return JSON.parse(plain) as T
  }
}

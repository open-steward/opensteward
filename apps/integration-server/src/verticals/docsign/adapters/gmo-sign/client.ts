/**
 * GMO Sign REST API client.
 *
 * Auth model: every call is a POST whose JSON body carries `cus_id`,
 * `secret_key`, and a short-lived `access_token`. The access token is minted
 * by POSTing `cus_id` + `secret_key` to `/accesstoken/generate`; the client
 * fetches it lazily and caches it for the instance lifetime.
 *
 * The account-specific API host comes from `credentials.extra.accessUrl`
 * (captured on the credential form), defaulting to the public production
 * host. Every response is the `{ status, result, message }` envelope; the
 * client unwraps `result` and throws on a non-"0" status.
 *
 * Docs:
 *   https://learn.microsoft.com/en-us/connectors/gmosign/
 *   https://support.questetra.com/addons/gmo-sign-envelope-retrieve-status/
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  ACCESS_TOKEN_PATH,
  DEFAULT_ACCESS_URL,
  STATUS_OK,
} from './constants'

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

/** The `{ status, result, message }` envelope wrapping every GMO Sign response. */
interface GmoSignEnvelopeResponse<T> {
  status?: string
  result?: T
  message?: string
}

export class GmoSignClient {
  private http: AxiosInstance
  private cusId: string
  private secretKey: string
  private accessToken?: string

  constructor(credentials: Credentials) {
    const accessUrl = String(credentials.extra?.['accessUrl'] ?? DEFAULT_ACCESS_URL)
    this.cusId = String(credentials.extra?.['cusId'] ?? '')
    this.secretKey = credentials.accessToken ?? ''
    this.http = axios.create({
      baseURL: `https://${accessUrl}`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** POST a path with the auth fields merged into the JSON body; unwrap `result`. */
  async call<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    const accessToken = await this.ensureAccessToken()
    return withRetry(async () => {
      const { data } = await this.http.post<GmoSignEnvelopeResponse<T>>(path, {
        cus_id: this.cusId,
        secret_key: this.secretKey,
        access_token: accessToken,
        ...body,
      })
      if (data.status !== undefined && data.status !== STATUS_OK) {
        throw new Error(
          `GMO Sign API error on ${path}: status=${data.status}${data.message ? ` ${data.message}` : ''}`,
        )
      }
      return (data.result ?? ({} as T)) as T
    })
  }

  /** Lazily mint + cache the per-instance access token from cus_id + secret_key. */
  private async ensureAccessToken(): Promise<string> {
    if (this.accessToken) return this.accessToken
    const token = await withRetry(async () => {
      const { data } = await this.http.post<GmoSignEnvelopeResponse<{ access_token?: string }>>(
        ACCESS_TOKEN_PATH,
        { cus_id: this.cusId, secret_key: this.secretKey },
      )
      if (data.status !== undefined && data.status !== STATUS_OK) {
        throw new Error(
          `GMO Sign access-token request failed: status=${data.status}${data.message ? ` ${data.message}` : ''}`,
        )
      }
      return data.result?.access_token ?? ''
    })
    if (!token) throw new Error('GMO Sign did not return an access_token')
    this.accessToken = token
    return token
  }
}

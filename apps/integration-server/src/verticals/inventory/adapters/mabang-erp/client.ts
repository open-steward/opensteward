/**
 * Mabang ERP HTTP client.
 *
 * Every request is a POST to http://openapi.mabangerp.com with a JSON body.
 * The body always contains { developerId, timestamp, action, ...params }.
 * The Authorization header carries the HMAC-SHA256 signature of the
 * serialised body (hex-encoded), keyed by the developer secret key.
 *
 * Rate limit: 300 req/min. Timestamps are valid ±30 minutes.
 */
import axios, { type AxiosError } from 'axios'
import { createHmac } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

/** Common envelope returned by every Mabang API response. */
export interface MabangEnvelope<T = unknown> {
  code: string
  message: string
  pageCount?: number
  dataCount?: number
  data?: T
}

function signBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class MabangErpClient {
  private readonly developerKey: string
  private readonly developerId: string

  constructor(credentials: Credentials) {
    const developerId = String(credentials.extra?.['developerId'] ?? '')
    if (!developerId) throw new Error('mabang-erp requires credentials.extra.developerId')
    this.developerKey = credentials.accessToken
    this.developerId = developerId
  }

  /**
   * Execute a Mabang API action.
   * @param action  The action string (e.g. "do-search-stockSku")
   * @param params  Additional body parameters (merged with the auth envelope)
   */
  async call<T>(action: string, params: Record<string, unknown> = {}): Promise<MabangEnvelope<T>> {
    return withRetry(async () => {
      const timestamp = String(Math.floor(Date.now() / 1000))
      const body: Record<string, unknown> = {
        developerId: this.developerId,
        timestamp,
        action,
        ...params,
      }
      const bodyStr = JSON.stringify(body)
      const signature = signBody(bodyStr, this.developerKey)

      const { data } = await axios.post<MabangEnvelope<T>>(API_BASE_URL, bodyStr, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: signature,
        },
        timeout: 30_000,
      })

      if (data.code !== '0000') {
        throw new Error(`mabang-erp API error [${data.code}]: ${data.message}`)
      }
      return data
    })
  }
}

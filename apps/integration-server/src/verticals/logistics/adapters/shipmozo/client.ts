import axios, { type AxiosInstance } from 'axios'
import { SHIPMOZO_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Every documented response (API documentation PDF): result, `"1" for success,
 * "0" for failure.`; message, `Success or error message.`; data.
 */
export interface ShipMozoEnvelope<T> {
  result?: string | null
  message?: string | null
  data?: T
}

/**
 * The private key stored beside the public key. Connections made before the
 * two-key form hold only one key, and no documented call succeeds without both.
 */
function privateKeyOf(credentials: Credentials): string {
  const value = credentials.extra?.['privateKey']
  if (typeof value !== 'string' || value === '') {
    throw Object.assign(
      new Error(
        'Shipmozo needs both the public key and the private key; reconnect this connection with both.',
      ),
      { statusCode: 401, code: 'CREDENTIALS_INCOMPLETE' },
    )
  }
  return value
}

/**
 * Shipmozo API v1 client: base https://shipping-api.com/app/api/v1, with the
 * "public-key" and "private-key" headers on every call
 * (https://shipping-api.com/api/v1?api-docs-v1.json).
 */
export class ShipMozoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const privateKey = privateKeyOf(credentials)
    this.http = axios.create({
      baseURL: SHIPMOZO_API_BASE,
      headers: {
        'public-key': credentials.accessToken,
        'private-key': privateKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /** GET `path` and return `data`. A body whose result is not "1" is thrown. */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T | undefined> {
    return withRetry(async () => {
      const { data } = await this.http.get<ShipMozoEnvelope<T>>(path, { params })
      return unwrap(path, data)
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}

function unwrap<T>(path: string, body: ShipMozoEnvelope<T> | undefined): T | undefined {
  if (String(body?.result ?? '') !== '1') {
    throw Object.assign(
      new Error(
        `Shipmozo ${path} answered result ${String(body?.result)}` +
          (body?.message ? `: ${String(body.message)}` : ''),
      ),
      { statusCode: 502, code: 'UPSTREAM_ERROR' },
    )
  }
  return body?.data
}

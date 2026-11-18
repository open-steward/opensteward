/**
 * eSignGlobal (eSign.AI) REST API client.
 *
 * Auth: `Authorization: Bearer <accessToken>`. JSON in/out. Every endpoint
 * nests under `${baseUrl}/esignglobal/v1/...` where `baseUrl` is the
 * regional data-centre host resolved at credential-exchange time and stored
 * on `credentials.extra.baseUrl`.
 *
 * Responses are wrapped in an envelope `{ code, data, message }`. `code` is
 * "0" on success; anything else is an application-level error. The client
 * unwraps `data` and throws on a non-zero code so adapter code only deals
 * with the payload.
 *
 * eSignGlobal has no envelope list/search endpoint — envelopes are read by
 * id — so the only pagination on the read surface is `pageNum` + `pageSize`
 * on the template list.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_PATH_PREFIX, DEFAULT_BASE_URL, SUCCESS_CODE } from './constants'

/** eSignGlobal's standard response wrapper. */
interface EsignglobalEnvelopeResponse<T> {
  code?: string | number
  message?: string
  data?: T
}

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

export class EsignglobalClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseUrl = String(credentials.extra?.['baseUrl'] ?? DEFAULT_BASE_URL)
    this.http = axios.create({
      baseURL: `${baseUrl}${API_PATH_PREFIX}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Unwrap the `{ code, data, message }` envelope, throwing on a non-zero code. */
  private unwrap<T>(body: EsignglobalEnvelopeResponse<T>): T {
    const code = body?.code
    if (code !== undefined && String(code) !== SUCCESS_CODE) {
      throw new Error(`eSignGlobal API error ${code}: ${body?.message ?? 'unknown error'}`)
    }
    return (body?.data ?? ({} as T)) as T
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<EsignglobalEnvelopeResponse<T>>(path, { params })
      return this.unwrap<T>(data)
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<EsignglobalEnvelopeResponse<T>>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return this.unwrap<T>(data)
    })
  }
}

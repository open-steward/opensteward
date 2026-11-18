/**
 * Trustly JSON-RPC client — thin axios wrapper.
 *
 * Every Trustly call is an HTTPS POST of a JSON-RPC 2.0 envelope to the single
 * `/api/1` endpoint:
 *
 *   {
 *     "method":  "Deposit",
 *     "version": "1.1",
 *     "params": {
 *       "UUID":      "<uuid>",
 *       "Signature": "<base64 RSA-SHA1 of method+uuid+serialize(Data)>",
 *       "Data": { "Username": "...", "Password": "...", ...methodFields }
 *     }
 *   }
 *
 * `Username` + `Password` live inside `Data`; the whole `Data` object is signed
 * with the merchant private key. There is no cursor pagination — `AccountLedger`
 * is bounded by a date range instead.
 *
 * Docs: https://docs.trustly.com/api/api-protocol
 */

import { randomUUID } from 'node:crypto'
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_PROD_BASE_URL, API_TEST_BASE_URL } from './constants'
import { readAuth, readEnvironment, signRequest } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
      if ((status === 429 || (status !== undefined && status >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

interface JsonRpcResult<T> {
  result?: { uuid?: string; method?: string; data?: T }
  error?: { name?: string; code?: number; message?: string; error?: { message?: string } }
}

export class TrustlyClient {
  private http: AxiosInstance
  private username: string
  private password: string
  private privateKey: string

  constructor(credentials: Credentials) {
    const auth = readAuth(credentials)
    this.username = auth.username
    this.password = auth.password
    this.privateKey = auth.privateKey
    const baseURL = readEnvironment(credentials) === 'production' ? API_PROD_BASE_URL : API_TEST_BASE_URL
    this.http = axios.create({
      baseURL,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  /**
   * Invoke a Trustly JSON-RPC method. `fields` are the method-specific entries
   * of `Data`; `Username` + `Password` are injected, then the whole `Data`
   * object is signed. Returns the inner `result.data`.
   */
  async call<T>(method: string, fields: Record<string, unknown> = {}): Promise<T> {
    const uuid = randomUUID()
    const data: Record<string, unknown> = {
      Username: this.username,
      Password: this.password,
      ...fields,
    }
    const signature = signRequest(method, uuid, data, this.privateKey)
    const envelope = {
      method,
      version: '1.1',
      params: { UUID: uuid, Signature: signature, Data: data },
    }

    return withRetry(async () => {
      const { data: body } = await this.http.post<JsonRpcResult<T>>('', envelope)
      if (body.error) {
        const msg = body.error.error?.message ?? body.error.message ?? body.error.name ?? 'unknown error'
        throw new Error(`Trustly ${method} failed: ${msg}`)
      }
      return (body.result?.data ?? {}) as T
    })
  }
}

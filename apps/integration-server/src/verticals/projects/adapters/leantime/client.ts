/**
 * Leantime JSON-RPC client.
 *
 * All API calls are HTTP POST to a single endpoint: {baseUrl}/api/jsonrpc
 * Authentication: `x-api-key` header.
 *
 * The Leantime API follows JSON-RPC 2.0:
 *   Request:  { jsonrpc: "2.0", method: "leantime.rpc.{Domain}.{method}", params: {}, id: 1 }
 *   Response: { jsonrpc: "2.0", result: <data> | [], id: 1 }
 *   Error:    { jsonrpc: "2.0", error: { code, message }, id: 1 }
 *
 * The base URL is taken from `credentials.extra.baseUrl`; `credentials.accessToken`
 * carries the API key.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { JSONRPC_PATH } from './constants'

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

/** JSON-RPC 2.0 response envelope. */
interface JsonRpcResponse<T> {
  jsonrpc: '2.0'
  id: number
  result?: T
  error?: { code: number; message: string }
}

export class LeantimeClient {
  private http: AxiosInstance
  private rpcUrl: string
  private reqId = 0

  constructor(credentials: Credentials) {
    const apiKey = (credentials.accessToken ?? '').trim()
    if (!apiKey) {
      throw new Error('Leantime connection is missing the API key.')
    }
    const baseUrl = (
      (credentials.extra as Record<string, unknown> | undefined)?.['baseUrl'] as string | undefined
    )?.replace(/\/$/, '') ?? ''

    this.rpcUrl = baseUrl + JSONRPC_PATH
    this.http = axios.create({
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      timeout: 30_000,
    })
  }

  /**
   * Call a Leantime JSON-RPC method.
   * Method names follow the pattern `leantime.rpc.{Domain}.{method}` or
   * `leantime.rpc.{Domain}.{Service}.{method}`.
   */
  async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => {
      const id = ++this.reqId
      const { data } = await this.http.post<JsonRpcResponse<T>>(this.rpcUrl, {
        jsonrpc: '2.0',
        method,
        params,
        id,
      })
      if (data.error) {
        throw new Error(`Leantime RPC error [${data.error.code}]: ${data.error.message}`)
      }
      return data.result as T
    })
  }
}

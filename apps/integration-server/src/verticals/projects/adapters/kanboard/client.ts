/**
 * Kanboard JSON-RPC 2.0 client.
 *
 * Kanboard exposes a single endpoint: POST <instanceUrl>/jsonrpc.php
 * Authentication: HTTP Basic with username "jsonrpc" and the API token as password.
 * The Authorization header value is Base64("jsonrpc:<token>").
 *
 * Docs: https://docs.kanboard.org/v1/api/authentication/
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { JSONRPC_PATH } from './constants'

let _rpcId = 1
function nextId(): number {
  return _rpcId++
}

interface RpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

interface RpcResponse<T> {
  jsonrpc: '2.0'
  id: number
  result?: T
  error?: { code: number; message: string }
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

export class KanboardClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseUrl = String(credentials.extra?.['baseUrl'] ?? '')
    const apiToken = String(credentials.extra?.['apiToken'] ?? '')
    const encoded = Buffer.from(`jsonrpc:${apiToken}`).toString('base64')

    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Basic ${encoded}`,
      },
      timeout: 30_000,
    })
  }

  async call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const body: RpcRequest = {
        jsonrpc: '2.0',
        id: nextId(),
        method,
        ...(params ? { params } : {}),
      }
      const { data } = await this.http.post<RpcResponse<T>>(JSONRPC_PATH, body)
      if (data.error) {
        throw new Error(`Kanboard RPC error ${data.error.code}: ${data.error.message}`)
      }
      return data.result as T
    })
  }
}

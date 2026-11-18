import { createHmac } from 'crypto'
import axios, { type AxiosInstance } from 'axios'
import { LALAMOVE_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

function parseCredentials(accessToken: string): { apiKey: string; secret: string } {
  const [apiKey, secret] = accessToken.split(':')
  if (!apiKey || !secret) {
    throw new Error('Lalamove credentials must be in format "apiKey:secret"')
  }
  return { apiKey, secret }
}

function sign(
  method: string,
  path: string,
  body: string,
  timestamp: string,
  secret: string,
): string {
  const raw = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`
  return createHmac('sha256', secret).update(raw).digest('hex')
}

export class LalamoveClient {
  private http: AxiosInstance
  private apiKey: string
  private secret: string

  constructor(credentials: Credentials) {
    const { apiKey, secret } = parseCredentials(credentials.accessToken)
    this.apiKey = apiKey
    this.secret = secret

    this.http = axios.create({
      baseURL: LALAMOVE_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  private buildAuthHeader(method: string, path: string, body: string): string {
    const timestamp = Date.now().toString()
    const signature = sign(method, path, body, timestamp, this.secret)
    return `hmac ${this.apiKey}:${timestamp}:${signature}`
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const authorization = this.buildAuthHeader('GET', path, '')
      const { data } = await this.http.get<T>(path, {
        params,
        headers: { Authorization: authorization },
      })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const bodyStr = JSON.stringify(body)
      const authorization = this.buildAuthHeader('POST', path, bodyStr)
      const { data } = await this.http.post<T>(path, body, {
        headers: { Authorization: authorization },
      })
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      const authorization = this.buildAuthHeader('DELETE', path, '')
      await this.http.delete(path, {
        headers: { Authorization: authorization },
      })
    })
  }
}

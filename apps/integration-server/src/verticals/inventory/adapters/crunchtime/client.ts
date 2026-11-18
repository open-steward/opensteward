import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

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

/**
 * CrunchtimeClient — wraps the net-chef.com REST API.
 *
 * All four auth values are sent as HTTP headers on every request:
 *   authenticationtoken, sitename, userid, password
 */
export class CrunchtimeClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const sitename = String(credentials.extra?.['sitename'] ?? '')
    const userid = String(credentials.extra?.['userid'] ?? '')
    const password = String(credentials.extra?.['password'] ?? '')
    if (!sitename || !userid || !password) {
      throw new Error(
        'crunchtime requires credentials.extra.sitename, userid, and password',
      )
    }
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        authenticationtoken: credentials.accessToken,
        sitename,
        userid,
        password,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}

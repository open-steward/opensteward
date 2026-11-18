import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { LOGINEXT_API_BASE, LOGINEXT_AUTH_HEADER } from './constants'
import type { Credentials } from '../../adapter/interface'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const ae = err as AxiosError
      if (ae.response?.status === 429 && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * The documented header value: "WWW-Authenticate | BASIC
 * 51bbe3f7-1671-476c-818a-e7fbbca10202 | Authentication token". A token pasted
 * with its `BASIC` keyword already on it is sent as it is.
 */
export function loginextAuthHeader(token: string | undefined): string {
  const t = (token ?? '').trim()
  return /^basic\s/i.test(t) ? t : `BASIC ${t}`
}

/**
 * LogiNext authenticates with the token from `POST /LoginApp/login/authenticate`
 * (or the account's API Token Management page), sent in the `WWW-Authenticate`
 * request header with the `BASIC` keyword.
 */
export class LoginextClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: LOGINEXT_API_BASE,
      headers: {
        [LOGINEXT_AUTH_HEADER]: loginextAuthHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }
}

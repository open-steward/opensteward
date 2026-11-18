/**
 * Sprinklr Service HTTP client.
 *
 * Auth: every request requires two headers:
 *   Authorization: Bearer {access_token}
 *   key: {api_key}
 *
 * Base URL: https://api3.sprinklr.com/{env}/api/v2 (and /api/v1)
 *   env is taken from credentials.extra.env ('' = production). Getting Started
 *   (https://dev.sprinklr.com/getting-started): "app.sprinklr.com:
 *   https://api3.sprinklr.com/api/v1/{endpoint} … prod2.sprinklr.com:
 *   https://api3.sprinklr.com/prod2/api/v1/{endpoint}" and "No need to enter
 *   {env} in case of Production environment, remove {env} from URL."
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENV } from './constants'

function buildBaseUrl(env: string): string {
  const envSegment = env ? `/${env}` : ''
  return `https://api3.sprinklr.com${envSegment}/api/v2`
}

/** v1 base (bootstrap/resources endpoint is v1) */
function buildV1BaseUrl(env: string): string {
  const envSegment = env ? `/${env}` : ''
  return `https://api3.sprinklr.com${envSegment}/api/v1`
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

export class SprinklrServiceClient {
  private http: AxiosInstance
  private httpV1: AxiosInstance

  constructor(credentials: Credentials) {
    const env = String(credentials.extra?.['env'] ?? DEFAULT_ENV)
    const apiKey = String(credentials.extra?.['apiKey'] ?? '')
    const headers: Record<string, string> = {
      Authorization: `Bearer ${credentials.accessToken}`,
      Accept: 'application/json',
    }
    if (apiKey) {
      headers['key'] = apiKey
    }

    this.http = axios.create({
      baseURL: buildBaseUrl(env),
      headers,
      timeout: 30_000,
    })

    this.httpV1 = axios.create({
      baseURL: buildV1BaseUrl(env),
      headers,
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async getV1<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.httpV1.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }

  async postV1<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.httpV1.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}

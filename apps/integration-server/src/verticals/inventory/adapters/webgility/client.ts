import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

/**
 * Webgility Connect client.
 *
 * Credentials flow:
 *  1. credentials.extra contains { appKey, appSecret, userEmail }.
 *  2. On first use, POST /v1/appusers to exchange those for an AccessToken.
 *  3. Every subsequent request sends: Authorization: Bearer <AccessToken>
 *
 * Ref: https://github.com/webgility/connect-v1.0/wiki/AppUsers-API
 */

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

interface AppUsersResponse {
  Message?: string
  AccessToken?: string
}

export class WebgilityClient {
  private accessToken: string | null = null
  private readonly appKey: string
  private readonly appSecret: string
  private readonly userEmail: string

  constructor(credentials: Credentials) {
    // credentials.accessToken may be empty on first call; extra holds raw creds
    this.accessToken = credentials.accessToken || null
    this.appKey = String(credentials.extra?.['appKey'] ?? '')
    this.appSecret = String(credentials.extra?.['appSecret'] ?? '')
    this.userEmail = String(credentials.extra?.['userEmail'] ?? '')
    if (!this.appKey || !this.appSecret || !this.userEmail) {
      throw new Error('webgility requires credentials.extra.appKey, appSecret, and userEmail')
    }
  }

  private async bootstrap(): Promise<string> {
    if (this.accessToken) return this.accessToken
    const bare = axios.create({ baseURL: API_BASE_URL, timeout: 30_000 })
    const { data } = await bare.post<AppUsersResponse>('/appusers', {
      appKey: this.appKey,
      appSecret: this.appSecret,
      userEmail: this.userEmail,
    }, { headers: { 'Content-Type': 'application/json' } })
    if (!data.AccessToken) throw new Error('webgility /appusers did not return an AccessToken')
    this.accessToken = data.AccessToken
    return this.accessToken
  }

  private async http(): Promise<AxiosInstance> {
    const token = await this.bootstrap()
    return axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const instance = await this.http()
      const { data } = await instance.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const instance = await this.http()
      const { data } = await instance.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}

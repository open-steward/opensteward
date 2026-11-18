/**
 * eGain HTTP client.
 *
 * Constructs the base URL from credentials.extra.tenantHost and sends
 * OAuth2 Bearer tokens in the Authorization header.
 *
 * The eGain REST Interaction API base is:
 *   https://{tenantHost}/system/ws/v12/
 *
 * Docs: https://hd.egain.com/api/authoring_interaction_api_reference/html/d1/dfb/intro.html
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_PATH } from './constants'
import { normaliseTenantHost } from './auth'

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

export class EgainClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // Throws for a missing host or one outside egain.cloud: the bearer token goes nowhere else.
    const baseURL = `https://${normaliseTenantHost(credentials.extra?.['tenantHost'])}${API_BASE_PATH}`
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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
}

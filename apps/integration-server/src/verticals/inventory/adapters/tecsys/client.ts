/**
 * HTTP client for the Tecsys OrderDynamics REST API.
 *
 * Authentication: Bearer token obtained via Azure AD client_credentials grant.
 * The token is passed as a standard Authorization header. The Azure APIM
 * gateway also requires the subscription key (Ocp-Apim-Subscription-Key)
 * for portal-registered integrations; if the customer supplies one it is read
 * from credentials.extra.subscriptionKey and added automatically.
 *
 * Retry: up to 4 attempts with exponential back-off on 429 and 5xx responses.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, API_VERSION } from './constants'

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

export class TecsysClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const subscriptionKey = String(credentials.extra?.['subscriptionKey'] ?? '')
    const extraHeaders: Record<string, string> = {}
    if (subscriptionKey) {
      extraHeaders['Ocp-Apim-Subscription-Key'] = subscriptionKey
    }

    this.http = axios.create({
      baseURL: `${API_BASE_URL}/${API_VERSION}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        ...extraHeaders,
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

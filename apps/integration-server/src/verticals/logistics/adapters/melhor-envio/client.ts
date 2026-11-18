import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
import {
  MELHOR_ENVIO_API_BASE,
  MELHOR_ENVIO_SANDBOX_API_BASE,
} from './constants'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export class MelhorEnvioClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, sandbox = false) {
    const baseURL = sandbox ? MELHOR_ENVIO_SANDBOX_API_BASE : MELHOR_ENVIO_API_BASE

    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Melhor Envio requires a descriptive User-Agent with a support contact.
        'User-Agent': 'OpenSteward/1.0 (support@opensteward.dev)',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}

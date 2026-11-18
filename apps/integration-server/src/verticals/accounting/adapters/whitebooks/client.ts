import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'
import { WHITEBOOKS_EINVOICE_API_BASE, WHITEBOOKS_GST_API_BASE } from './constants'

/**
 * WhiteBooks HTTP client.
 *
 * WhiteBooks exposes two separate API namespaces:
 *   - /einvoice  (e-Invoice / IRN generation)
 *   - /gst       (GST filing, GSTIN lookup, HSN/SAC search)
 *
 * Both require the same Bearer token obtained via client-credentials grant.
 * `WhitebooksClient` defaults to the e-Invoice base URL; call `.gst()` for
 * a client pointed at the GST namespace.
 */
export class WhitebooksClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, baseURL: string = WHITEBOOKS_EINVOICE_API_BASE) {
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /** Returns a client scoped to the GST namespace. */
  static gst(credentials: Credentials): WhitebooksClient {
    return new WhitebooksClient(credentials, WHITEBOOKS_GST_API_BASE)
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

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}

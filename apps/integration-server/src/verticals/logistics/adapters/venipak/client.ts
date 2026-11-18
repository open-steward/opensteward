import axios, { type AxiosInstance } from 'axios'
import { VENIPAK_API_BASE } from './constants'
import { getAuthParams } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Venipak HTTP client.
 *
 * All Venipak API endpoints accept POST requests with `user` and `pass`
 * form fields for authentication. XML shipment creation sends the XML as
 * the `xml_text` form field. Other endpoints use JSON or plain form params.
 */
export class VenipakClient {
  private http: AxiosInstance
  private user: string
  private pass: string

  constructor(credentials: Credentials) {
    const { user, pass } = getAuthParams(credentials)
    this.user = user
    this.pass = pass
    this.http = axios.create({
      baseURL: VENIPAK_API_BASE,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json, application/xml, text/xml, */*',
      },
    })
  }

  /**
   * POST form-encoded params (plus auth fields).
   */
  async postForm<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
    const body = new URLSearchParams({
      user: this.user,
      pass: this.pass,
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v ?? '')]),
      ),
    })
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body.toString())
      return data
    })
  }

  /**
   * POST XML shipment data as `xml_text` form field.
   */
  async postXml<T>(path: string, xmlText: string): Promise<T> {
    const body = new URLSearchParams({
      user: this.user,
      pass: this.pass,
      xml_text: xmlText,
    })
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body.toString())
      return data
    })
  }

  /**
   * GET request with query params (plus auth).
   */
  async get<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { user: this.user, pass: this.pass, ...params },
      })
      return data
    })
  }
}

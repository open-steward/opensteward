import axios, { type AxiosInstance } from 'axios'
import { SHIPPYPRO_API_BASE } from './constants'
import { authHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * ShippyPro v1: one POST path per method, with a `{ Method, Params }` body.
 *
 * https://api.shippypro.com/docs/v1.json: the servers entry is
 * `https://api.shippypro.com`, each operation's path is `/v1/<Method>`
 * (`/v1/GetCarriers`, `/v1/GetShipmentsReport`, …), and every request body is
 * `"required":["Method","Params"]` with `"Method":{"type":"string","const":"<Method>"}`.
 */
export class ShippyProClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: SHIPPYPRO_API_BASE,
      headers: {
        Authorization: authHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(`/${method}`, { Method: method, Params: params })
      return data
    })
  }
}

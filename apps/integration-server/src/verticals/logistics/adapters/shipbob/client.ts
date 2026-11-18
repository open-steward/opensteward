import axios, { type AxiosInstance } from 'axios'
import { SHIPBOB_API_BASE, SHIPBOB_SANDBOX_API_BASE } from './constants'
import { authHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export class ShipBobClient {
  private http: AxiosInstance
  private channelId?: string

  constructor(credentials: Credentials, sandbox = false) {
    // NOT a default header. `shipbob_channel_id` does not merely identify the
    // caller — on a read it FILTERS the response to that channel, and ShipBob
    // mints one channel per authorized application, so ours owns only what our
    // application created. Measured on a live account: `GET /order` returned
    // 25 orders without the header and 0 with it. It goes on the specific
    // calls that attribute a new record to a channel, via `channelScoped`.
    this.channelId = credentials.extra?.channelId as string | undefined

    const headers: Record<string, string> = {
      Authorization: authHeader(credentials.accessToken),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }

    this.http = axios.create({
      // A staging token is only valid against the staging API. Authorizing in
      // one environment and calling the other returns 401 on every request.
      baseURL: sandbox ? SHIPBOB_SANDBOX_API_BASE : SHIPBOB_API_BASE,
      headers,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  /**
   * @param opts.channelScoped attach `shipbob_channel_id`. For calls that
   *   attribute a NEW record to a channel (order creation) or that ShipBob
   *   documents as requiring it (`order:estimate`). Not for cancel or modify:
   *   ShipBob wants the channel that CREATED the record there, which for an
   *   order the merchant placed elsewhere is not ours.
   */
  async post<T>(
    path: string,
    body: unknown,
    opts?: { channelScoped?: boolean },
  ): Promise<T> {
    const headers =
      opts?.channelScoped && this.channelId
        ? { shipbob_channel_id: this.channelId }
        : undefined
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, headers ? { headers } : undefined)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}

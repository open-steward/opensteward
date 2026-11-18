import axios, { type AxiosInstance } from 'axios'
import {
  FRENET_API_BASE,
  FRENET_AUTH_HEADER,
  FRENET_PARTNER_HEADER,
  FRENET_WHITELABEL_BASE,
} from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * HTTP client for one Frenet host. Every documented route takes the client
 * token in a `token` header; the WhiteLabel routes also take `x-partner-token`.
 */
export class FrenetClient {
  private http: AxiosInstance

  constructor(
    credentials: Credentials,
    baseURL: string,
    extraHeaders: Record<string, string> = {},
  ) {
    this.http = axios.create({
      baseURL,
      headers: {
        [FRENET_AUTH_HEADER]: credentials.accessToken,
        ...extraHeaders,
        'Content-Type': 'application/json',
        Accept: 'application/json',
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
}

/** Client for https://api.frenet.com.br (tracking, quotes). */
export function apiClient(credentials: Credentials): FrenetClient {
  return new FrenetClient(credentials, FRENET_API_BASE)
}

/**
 * Client for https://whitelabel.frenet.com.br/v1 (shipments, orders, labels).
 *
 * Every WhiteLabel route declares `x-partner-token` required. Frenet's
 * Autenticação page: "O Partner Token é o código único da plataforma" — the
 * integrator's token, so it comes from the adapter config (`partnerToken`),
 * not from the merchant's connection. Without it the call is refused before
 * anything is sent.
 */
export function whitelabelClient(
  credentials: Credentials,
  partnerToken: string | undefined,
): FrenetClient {
  if (!partnerToken) {
    throw Object.assign(
      new Error(
        'Frenet WhiteLabel routes require the platform partner token ("x-partner-token", required): ' +
          'set `partnerToken` in the frenet adapter config',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }
  return new FrenetClient(credentials, FRENET_WHITELABEL_BASE, {
    [FRENET_PARTNER_HEADER]: partnerToken,
  })
}

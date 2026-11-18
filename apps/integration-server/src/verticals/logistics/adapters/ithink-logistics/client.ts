import axios, { type AxiosInstance } from 'axios'
import { ITHINK_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/** The fields every documented v3 response carries, e.g. `"status_code": 200`. */
export interface IthinkLogisticsEnvelope {
  status?: string | null
  status_code?: number | string | null
  [key: string]: unknown
}

/**
 * The secret key stored beside the access token. Connections made before the
 * two-secret form hold only the old single key, and no v3 request can succeed
 * without both.
 */
function secretKeyOf(credentials: Credentials): string {
  const value = credentials.extra?.['secretKey']
  if (typeof value !== 'string' || value === '') {
    throw Object.assign(
      new Error(
        'iThink Logistics needs both the access token and the secret key; reconnect this ' +
          'connection with both.',
      ),
      { statusCode: 401, code: 'CREDENTIALS_INCOMPLETE' },
    )
  }
  return value
}

/**
 * iThink Logistics v3 client. Every documented call is a POST whose body is
 * `{"data": {...fields, "access_token": ..., "secret_key": ...}}`
 * (https://docs.ithinklogistics.com/doc-get-warehouse/3), with no auth header.
 */
export class IthinkLogisticsClient {
  private http: AxiosInstance
  private accessToken: string
  private secretKey: string

  constructor(credentials: Credentials) {
    this.accessToken = credentials.accessToken
    this.secretKey = secretKeyOf(credentials)
    this.http = axios.create({
      baseURL: ITHINK_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /**
   * POST `fields` inside the documented `data` envelope. `path` is relative to
   * the v3 base, or an absolute URL (tracking lives on another host). A body
   * with a `status_code` other than 200 is thrown, never read as an empty
   * result.
   */
  async post<T extends IthinkLogisticsEnvelope>(
    path: string,
    fields: Record<string, unknown>,
  ): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, {
        data: { ...fields, access_token: this.accessToken, secret_key: this.secretKey },
      })
      // Every documented response carries "status_code": 200 on success.
      if (data?.status_code != null && Number(data.status_code) !== 200) {
        throw Object.assign(
          new Error(
            `iThink Logistics ${path} answered status_code ${String(data?.status_code)}` +
              (data?.status ? ` (${String(data.status)})` : ''),
          ),
          { statusCode: 502, code: 'UPSTREAM_ERROR' },
        )
      }
      return data
    })
  }
}

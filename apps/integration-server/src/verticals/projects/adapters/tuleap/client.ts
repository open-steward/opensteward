import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_HOST, API_PATH_PREFIX } from './constants'

/**
 * Thin HTTP client for the Tuleap REST API.
 *
 * Authentication: the personal access key is sent in the `X-Auth-AccessKey`
 * header (format: `tlp.k1.<base64-payload>`).
 *
 * Base URL: Tuleap is self-hosted. The instance URL is stored in
 * `credentials.extra.host`; it falls back to `DEFAULT_HOST`.
 * The `/api` path prefix is appended automatically.
 *
 * Pagination: query params `offset` (0-based) and `limit`. The `limit` bounds
 * are per route in https://tuleap.net/api/explorer/swagger.json: default 10,
 * maximum 50 on /projects, /projects/{id}/trackers and
 * /artifacts/{id}/changesets; default 100, maximum 1000 on
 * /trackers/{id}/artifacts. The `X-PAGINATION-SIZE` response header is an
 * upper bound on the matching rows (see `getPage`).
 */

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

export class TuleapClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKey = (credentials.accessToken ?? '').trim()
    if (!apiKey) {
      throw new Error('Tuleap connection is missing the personal access key.')
    }
    const host =
      (typeof credentials.extra?.['host'] === 'string' ? credentials.extra['host'] : '') ||
      DEFAULT_HOST
    this.http = axios.create({
      baseURL: host.replace(/\/$/, '') + API_PATH_PREFIX,
      headers: {
        'X-Auth-AccessKey': apiKey,
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

  /**
   * One page of a collection, with the `x-pagination-size` header: per
   * https://docs.tuleap.com/user-guide/integration/rest/collections.html,
   * "for most routes, `x-pagination-size` gives the maximum number of
   * matching elements", and a page may be short or empty when permissions
   * hide rows, so this header (not the page length) says where the end is.
   * `size` is undefined when the header is missing or unreadable.
   */
  async getPage<T>(
    path: string,
    params: Record<string, unknown>,
  ): Promise<{ rows: T[]; size: number | undefined }> {
    return withRetry(async () => {
      const res = await this.http.get<T[]>(path, { params })
      const raw = (res.headers as Record<string, unknown> | undefined)?.['x-pagination-size']
      const size = raw === undefined || raw === null || raw === '' ? NaN : Number(raw)
      return {
        rows: Array.isArray(res.data) ? res.data : [],
        size: Number.isFinite(size) && size >= 0 ? size : undefined,
      }
    })
  }
}

/**
 * Tray Commerce REST client.
 *
 * Verified directly from developers.tray.com.br (fetched with curl, not the
 * WebFetch summarizer — the site is a Slate-generated single static page and
 * the summarizer was truncating it well before this content; curl returns
 * the whole ~1.6MB page and every claim below is a literal quote from it).
 *
 * Two distinct body conventions coexist on this API, confirmed by direct
 * evidence rather than assumed:
 *
 *   - The legacy CakePHP surface (products, `/products/variants`,
 *     categories, customers, orders) sends WRITES as
 *     `application/x-www-form-urlencoded` with the wrapper key baked
 *     literally into each field NAME as a bracket path, e.g. the docs' own
 *     curl example:
 *       --data-urlencode '["Product"]["ean"]=98799979789879'
 *     confirmed identically (same bracket-path convention, explicit
 *     `Content-Type: application/x-www-form-urlencoded` header) for
 *     variants, categories, customers and orders. Products' OWN curl
 *     example is the one inconsistency on the page — it shows a raw JSON
 *     `--data-raw` body with no Content-Type header at all, which would
 *     make curl send it as form-urlencoded anyway (curl's default) and
 *     corrupt the JSON. Every other language sample on that same page
 *     (PHP/C#/Java) — including products' own — shows the bracket-form
 *     convention with the header set explicitly. `postForm`/`putForm`
 *     follow the convention with 3-of-4 (and cross-resource) agreement.
 *   - The newer Multi-CD surface (`/multicd/...`) — a structurally
 *     different, Laravel-style JSON API (its own pagination shape is
 *     `{number, size, total, from, to, links}`, nothing like the legacy
 *     `{total, page, offset, limit, maxLimit}`) — sends and receives plain
 *     JSON, confirmed by its own documented request body
 *     (`{"product_id":10,"stock":2,"handling_days":3}`) with no
 *     alternative form-encoded example anywhere in that section.
 *     `postJson`/`putJson` are for this surface.
 *
 * `access_token` rides on axios `params` on every call (list/get/write
 * alike) — mandated by the platform ("All API requests require
 * `?access_token={token}`") and never string-concatenated into the path,
 * so `LOG_REDACT_PATHS`'s `err.config.params` redaction covers it (proven
 * in `tests/.../log-redaction.test.ts`).
 *
 * Rate limits (quoted verbatim): "1 - Quantidade de requisições de curto
 * espaço de tempo, limitado em 180 requisições por minuto. 2 - Quantidade
 * de requisições diárias, limitado em 10 mil requisições diárias por
 * loja." `withRetry` backs off on 429; this module has no bespoke limiter
 * beyond that.
 */
import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'

export interface TrayPaging {
  total?: number
  page?: number
  offset?: number
  limit?: number
  maxLimit?: number
}

/** `hasMore` from the legacy CakePHP `paging` block, or `undefined` when the platform reported nothing usable. */
export function pagingHasMore(paging: TrayPaging | undefined): boolean | undefined {
  if (!paging) return undefined
  const { total, page, limit } = paging
  if (total == null || page == null || limit == null) return undefined
  return page * limit < total
}

/** Multi-CD's own, differently-shaped pagination block (`{number, size, total, from, to, links}`). */
export interface TrayMultiCdPaging {
  number?: number
  size?: number
  total?: number
  to?: number
}

export function multiCdPagingHasMore(paging: TrayMultiCdPaging | undefined): boolean | undefined {
  if (!paging) return undefined
  const { number, size, total } = paging
  if (number == null || size == null || total == null) return undefined
  return number * size < total
}

/**
 * Flatten a nested value into the literal bracket-path field names Tray's
 * legacy write endpoints document, e.g.
 *   flattenToBracketForm({ name: 'X', Sku: [{ type: 'Cor' }] }, '["Product"]')
 * yields
 *   [['["Product"]["name"]', 'X'], ['["Product"]["Sku"][0]["type"]', 'Cor']]
 * `undefined` values are dropped (an absent field, not a sent empty one);
 * `null` is sent as the literal string `"null"` is avoided by dropping it
 * too, since no documented example ever sends a null.
 */
export function flattenToBracketForm(value: unknown, path: string): Array<[string, string]> {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => flattenToBracketForm(item, `${path}[${i}]`))
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      flattenToBracketForm(v, `${path}["${k}"]`),
    )
  }
  return [[path, String(value)]]
}

export class TrayCommerceClient {
  private http: AxiosInstance
  private accessToken: string

  constructor(credentials: Credentials) {
    const apiHost = credentials.extra?.['apiHost']
    if (typeof apiHost !== 'string' || apiHost.length === 0) {
      throw new Error(
        'Tray connection is missing its validated api_host (credentials.extra.apiHost) — reconnect required.',
      )
    }
    this.accessToken = credentials.accessToken
    this.http = axios.create({
      baseURL: apiHost,
      timeout: 30_000,
      headers: { Accept: 'application/json' },
    })
  }

  /** `access_token` always rides in `params`, never the path — see file header LOG SAFETY note. */
  private authParams(extra?: Record<string, unknown>): Record<string, unknown> {
    return { access_token: this.accessToken, ...extra }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params: this.authParams(params) })
      return data
    })
  }

  async delete<T = void>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, { params: this.authParams(params) })
      return data as T
    })
  }

  /**
   * Legacy write: `application/x-www-form-urlencoded`, bracket-path field
   * names, wrapped under `wrapperKey` (e.g. `postForm('products', 'Product',
   * { name: 'X' })` sends `["Product"]["name"]=X`).
   */
  async postForm<T>(path: string, wrapperKey: string, body: Record<string, unknown>): Promise<T> {
    return this.sendForm('post', path, wrapperKey, body)
  }

  async putForm<T>(path: string, wrapperKey: string, body: Record<string, unknown>): Promise<T> {
    return this.sendForm('put', path, wrapperKey, body)
  }

  private async sendForm<T>(
    method: 'post' | 'put',
    path: string,
    wrapperKey: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const params = new URLSearchParams()
    for (const [key, value] of flattenToBracketForm(body, `["${wrapperKey}"]`)) {
      params.append(key, value)
    }
    return withRetry(async () => {
      const { data } = await this.http[method]<T>(path, params.toString(), {
        params: this.authParams(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      return data
    })
  }

  /** Multi-CD write: plain JSON body — see file header for why this surface differs. */
  async postJson<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, { params: this.authParams() })
      return data
    })
  }

  async putJson<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, { params: this.authParams() })
      return data
    })
  }
}

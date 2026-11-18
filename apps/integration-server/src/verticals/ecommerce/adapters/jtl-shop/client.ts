/**
 * JTL-Shop REST API client.
 *
 * Key characteristics:
 *  - Base URL is per-instance: stored in `credentials.extra.baseUrl`.
 *  - The API is mounted at `{shop}/api/v1` (Router.php v5.8.0:
 *    "new RouteGroup('/api/v1', function (RouteGroup $group): void {"), and only
 *    when the shop owner sets SHOW_REST_API ("if (\SHOW_REST_API === false) {").
 *  - Auth: ApiKeyMiddleware reads "$key = $request->getHeader('x-api-key')[0] ?? null;".
 *  - Lists page by id keyset (`limit` + `cursor`), see {@link JtlShopClient.listPage}.
 *  - Every response is a league/fractal envelope: `{ data: ... }` for a single
 *    model (ResponseTrait::respondWithModel: "['data' => $item->rawArray(true)]"),
 *    `{ data: [...], meta: { cursor } }` for a list.
 *  - Retries on 429 / 5xx with exponential back-off.
 *
 * Source (JTL publishes no rendered REST reference; the controllers carry the
 * OpenAPI annotations): https://gitlab.com/jtl-software/jtl-shop/core/-/tree/v5.8.0/includes/src/REST
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION } from './constants'

// ── Retry helper ───────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

// ── Types ──────────────────────────────────────────────────────────────────────

/** The fractal envelope of a single model. */
export interface JtlItemEnvelope<T> {
  data: T
}

/**
 * The fractal envelope of a list: DataArraySerializer::collection
 * ("return ['data' => $data];") plus ArraySerializer::cursor
 * ("'current' => $cursor->getCurrent(), 'prev' => $cursor->getPrev(),
 * 'next' => $cursor->getNext(), 'count' => $cursor->getCount()") under `meta`.
 * league/fractal 0.20.2 (the version JTL-Shop 5.8.0 locks).
 */
export interface JtlCollectionEnvelope<T> {
  data: T[]
  meta?: {
    cursor?: {
      current?: number | string
      prev?: number | string
      next?: number | string
      count?: number
    }
  }
}

/**
 * The next cursor is the raw primary-key column of the page's last row
 * ("$newCursor = $all->last()->$primary ?? -1;"), fetched through NiceDB, which
 * sets "$options[PDO::ATTR_STRINGIFY_FETCHES] = true;", so on the wire it is a
 * decimal string such as "127". league/fractal 0.20.2's Cursor keeps it untyped
 * ("public function __construct($current = null, $prev = null, $next = null, ?int $count = null)").
 * A positive integer in either form is usable; anything else is not.
 */
function parseCursor(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw > 0 ? raw : null
  if (typeof raw === 'string' && /^[1-9][0-9]*$/.test(raw)) {
    const n = Number(raw)
    return Number.isSafeInteger(n) ? n : null
  }
  return null
}

/** One keyset page: its rows, and the cursor that starts the next page, or null at the end. */
export interface JtlKeysetPage<T> {
  items: T[]
  next: number | null
}

// ── Client ─────────────────────────────────────────────────────────────────────

export class JtlShopClient {
  private http: AxiosInstance
  readonly apiBase: string

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken
    const baseUrl = credentials.extra?.['baseUrl'] as string | undefined

    if (!apiKey) {
      throw new Error('JtlShopClient: credentials.accessToken (API key) is required')
    }
    if (!baseUrl) {
      throw new Error(
        'JtlShopClient: credentials.extra.baseUrl is required ' +
          '(e.g. https://myshop.example.com)',
      )
    }

    this.apiBase = `${baseUrl.replace(/\/$/, '')}/api/${API_VERSION}`
    this.http = axios.create({
      baseURL: this.apiBase,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
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

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /** GET a single model and unwrap its `data` envelope. */
  async getItem<T>(path: string): Promise<T> {
    const body = await this.get<JtlItemEnvelope<T> | null | undefined>(path)
    if (!body || typeof body !== 'object' || !('data' in body)) {
      throw new Error(`JTL-Shop GET ${path}: expected a { data } envelope`)
    }
    return body.data
  }

  /**
   * GET the unpaginated collection a lookup route answers (StockController::show
   * by product: "return $this->respondWithCollection($res, new DataModelTransformer());",
   * with no cursor).
   */
  async getCollection<T>(path: string): Promise<T[]> {
    const body = await this.get<JtlCollectionEnvelope<T> | null | undefined>(path)
    if (!body || !Array.isArray(body.data)) {
      throw new Error(`JTL-Shop GET ${path}: expected a { data: [...] } collection envelope`)
    }
    return body.data
  }

  /**
   * One page of an id-keyset list (AbstractController::index, v5.8.0):
   *
   *   "$limit = \max(1, (int)($request->getQueryParams()['limit'] ?? 10));"
   *   "$currentCursor = (int)($request->getQueryParams()['cursor'] ?? 0);"
   *   "' WHERE ' . $primary . ' > :lid LIMIT :lmt'"
   *   "$newCursor = $all->last()->$primary ?? -1;"
   *
   * `cursor` is sent only after page 1 (0 is the documented default). The next
   * page starts at `meta.cursor.next` — the primary key of this page's last row.
   * A page shorter than `limit` matched every remaining row, so it is the last;
   * `next` is -1 on an empty page.
   */
  async listPage<T>(path: string, limit: number, cursor?: number): Promise<JtlKeysetPage<T>> {
    const params: Record<string, number> = { limit }
    if (cursor !== undefined) params['cursor'] = cursor
    const body = await this.get<JtlCollectionEnvelope<T> | null | undefined>(path, params)
    if (!body || !Array.isArray(body.data)) {
      throw new Error(`JTL-Shop GET ${path}: expected a { data: [...] } collection envelope`)
    }
    if (body.data.length < limit) return { items: body.data, next: null }
    const raw = body.meta?.cursor?.next
    const next = parseCursor(raw)
    if (next === null) {
      throw new Error(
        `JTL-Shop GET ${path}: a full page came without a usable meta.cursor.next (${JSON.stringify(raw)})`,
      )
    }
    return { items: body.data, next }
  }
}

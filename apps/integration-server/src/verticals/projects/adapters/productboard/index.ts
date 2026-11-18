/**
 * Productboard adapter — projects vertical.
 *
 * Maps Productboard's product-discovery hierarchy onto the canonical model:
 *   • Project  ← `product` and `component` entities (grouping containers)
 *   • Task     ← `feature` and `subfeature` (leaf work items)
 *   • Comment  ← `note` (customer-feedback bodies linked to features)
 *   • User     ← workspace `user`
 *
 * REST v1 list endpoints are link-paginated at a fixed 100 rows:
 * `{ data, links: { next } }`. Notes page by a body-level `pageCursor`
 * instead, with a `pageLimit` of 1–2000. See `listRows` / `listNotes`.
 *
 * Docs: https://developer.productboard.com/reference/introduction
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: tag — tags on notes are plain strings with no id or color; no workspace-level tag listing endpoint exists
 * Unavailable: workspace — a token addresses a single id-less workspace; no /workspace endpoint or workspace id/name is exposed
 */
import { connectionScope, cursorPagerKey, pageByRows } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { User } from '../../schema/user'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as productboardExchange,
  refreshCredentials as productboardRefresh,
} from './auth'
import { ProductboardClient } from './client'
import { API_BASE_URL, DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, NOTES_MAX_PAGE_LIMIT } from './constants'
import { verifyProductboardWebhook, parseProductboardWebhookEvents } from './webhook'

import { transformProject, type RawProductboardProduct } from './transform/project'
import { transformTask, type RawProductboardFeature } from './transform/task'
import { transformComment, type RawProductboardNote } from './transform/comment'
import { transformUser, type RawProductboardUser } from './transform/user'

export interface ProductboardAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** Link-paginated v1 list envelope. */
interface ListResponse<T> {
  data?: T[]
  links?: { next?: string | null }
  pageCursor?: string | null
}

/** Where the products-then-components stream of `listProjects` resumes. */
interface ProjectsCursor {
  kind: 'products' | 'components'
  /** The `links.next` URL to fetch; absent for the first page of `kind`. */
  next?: string
}

/**
 * The `links.next` URL, if it names another page on the API host.
 *
 * The URL is followed verbatim with the connection's bearer token, so a link
 * to any other origin is refused rather than handed the token.
 */
function nextLink(links: { next?: string | null } | undefined): string | undefined {
  const next = links?.next
  if (!next) return undefined
  const url = new URL(next, API_BASE_URL)
  if (url.origin !== new URL(API_BASE_URL).origin)
    throw new Error(`Productboard links.next points off the API host: ${url.origin}`)
  return url.toString()
}

/** Axios' HTTP status on a failed request, if any. */
function httpStatus(err: unknown): number | undefined {
  const res = (err as { response?: { status?: unknown } } | null)?.response
  return typeof res?.status === 'number' ? res.status : undefined
}

/** Single-resource envelope (`{ data }`). */
interface GetResponse<T> {
  data?: T
}

export class ProductboardAdapter implements ProjectsAdapter {
  readonly platform = 'productboard'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ProductboardAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return productboardExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return productboardRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyProductboardWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseProductboardWebhookEvents(payload)
  }

  private client(credentials: Credentials): ProductboardClient {
    return new ProductboardClient(credentials)
  }

  /**
   * The caller's page of a link-paginated v1 list, cut from Productboard's
   * pages.
   *
   * `/products`, `/components`, `/features` and `/users` document no
   * page-size or offset parameter: "This API is paginated, only the first 100
   * items are returned by default. The client should then recursively follow
   * `links.next` link in the response to fetch the next page."
   * (https://developer.productboard.com/v1.0.0/reference/getproducts and
   * siblings). The adapter used to send only `pageLimit`, so every caller
   * page was upstream page 1. `pageByRows` follows `links.next` and serves
   * exactly rows [(page-1)×limit, page×limit) with `hasMore` exact.
   *
   * Keyed per connection (a token fingerprint: a token addresses a single
   * id-less workspace) and per filter. The upstream page size is fixed, so
   * the caller's `limit` is left out of the key.
   */
  private async listRows<T>(
    credentials: Credentials,
    path: string,
    filters: Record<string, unknown>,
    params: QueryParams,
  ): Promise<T[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope('productboard', credentials), path, filters)
    const { items } = await pageByRows<T, string>(
      key,
      params,
      async (next) => {
        const res = next
          ? await client.get<ListResponse<T>>(next)
          : await client.get<ListResponse<T>>(path, { ...filters })
        return { items: res.data ?? [], next: nextLink(res.links) }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  // ── Projects (products + components) ──────────────────────────────────────

  /**
   * Products, then components, as one stream: each is walked by
   * `links.next` to its end before the next begins, so a caller page may
   * straddle the two.
   */
  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope('productboard', credentials), 'projects', {})
    const { items } = await pageByRows<Project, ProjectsCursor>(
      key,
      params,
      async (cursor) => {
        const kind = cursor?.kind ?? 'products'
        const res = cursor?.next
          ? await client.get<ListResponse<RawProductboardProduct>>(cursor.next)
          : await client.get<ListResponse<RawProductboardProduct>>(`/${kind}`)
        const rows = (res.data ?? []).map((p) =>
          transformProject(p, kind === 'products' ? 'product' : 'component'),
        )
        const link = nextLink(res.links)
        // pageByRows' self-reference guard compares cursors by identity, and
        // a fresh cursor object never matches: check the link itself.
        if (link !== undefined && link === cursor?.next)
          throw new Error(
            `Productboard /${kind} links.next names the page it came from; following it would loop`,
          )
        const next: ProjectsCursor | undefined = link
          ? { kind, next: link }
          : kind === 'products'
            ? { kind: 'components' }
            : undefined
        return { items: rows, next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    // Try products first, then components
    try {
      const res = await this.client(credentials).get<GetResponse<RawProductboardProduct>>(
        `/products/${id}`,
      )
      if (res.data) return transformProject(res.data, 'product')
    } catch {
      // fall through to component lookup
    }
    const res = await this.client(credentials).get<GetResponse<RawProductboardProduct>>(
      `/components/${id}`,
    )
    if (!res.data) throw new Error(`Productboard product/component ${id} not found`)
    return transformProject(res.data, 'component')
  }

  // ── Tasks (features) ───────────────────────────────────────────────────────

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const rows = await this.listRows<RawProductboardFeature>(
      credentials,
      '/features',
      projectId ? { componentId: projectId } : {},
      params,
    )
    return rows.map((f) => transformTask(f, projectId || undefined))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<GetResponse<RawProductboardFeature>>(
      `/features/${id}`,
    )
    if (!res.data) throw new Error(`Productboard feature ${id} not found`)
    return transformTask(res.data)
  }

  // ── Comments (notes) ───────────────────────────────────────────────────────

  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    const rows = await this.listNotes(credentials, taskId ? { featureId: taskId } : {}, params)
    return rows.map((n) => transformComment(n, taskId || undefined))
  }

  /**
   * The caller's page of `GET /notes`, which pages by cursor rather than by
   * link: "`pageLimit` ... minimum 1, maximum 2000, default 100" and
   * "`pageCursor`: Use this pageCursor returned by search results to get next
   * page of results. GET /notes?pageCursor={pageCursor} If there is no next
   * page, this field is not present"
   * (https://developer.productboard.com/v1.0.0/reference/getnotes). The
   * adapter used to read `links.next`, which notes do not document, and never
   * sent a cursor, so every caller page was upstream page 1.
   *
   * `pageLimit` is the caller's limit capped at 2000; `pageByRows` cuts the
   * caller's rows whatever size the upstream pages come back at, so a cursor
   * that does not carry the size forward cannot misalign pages. "The
   * pageCursor is valid for 1 minute": an expired one is answered 422
   * (PageCursorInvalid), and the walk restarts from the first page.
   *
   * An explicit `cursor` param is an upstream position, not a row offset,
   * and fetches that one page as before.
   */
  private async listNotes(
    credentials: Credentials,
    filters: Record<string, unknown>,
    params: QueryParams,
  ): Promise<RawProductboardNote[]> {
    const client = this.client(credentials)
    const pageLimit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, NOTES_MAX_PAGE_LIMIT)
    const query = { ...filters, pageLimit }
    if (params['cursor']) {
      const res = await client.get<ListResponse<RawProductboardNote>>('/notes', {
        ...query,
        pageCursor: String(params['cursor']),
      })
      return res.data ?? []
    }
    const key = cursorPagerKey(connectionScope('productboard', credentials), '/notes', query)
    const { items } = await pageByRows<RawProductboardNote, string>(
      key,
      params,
      async (cursor) => {
        const res = await client.get<ListResponse<RawProductboardNote>>('/notes', {
          ...query,
          ...(cursor ? { pageCursor: cursor } : {}),
        })
        return { items: res.data ?? [], next: res.pageCursor || undefined }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE, restartOn: (err) => httpStatus(err) === 422 },
    )
    return items
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const res = await this.client(credentials).get<GetResponse<RawProductboardNote>>(`/notes/${id}`)
    if (!res.data) throw new Error(`Productboard note ${id} not found`)
    return transformComment(res.data)
  }

  // ── Users (workspace members) ──────────────────────────────────────────────

  async listUsers(credentials: Credentials, _workspaceId: string, params: QueryParams): Promise<User[]> {
    const rows = await this.listRows<RawProductboardUser>(credentials, '/users', {}, params)
    return rows.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<GetResponse<RawProductboardUser>>(`/users/${id}`)
    if (!res.data) throw new Error(`Productboard user ${id} not found`)
    return transformUser(res.data)
  }
}

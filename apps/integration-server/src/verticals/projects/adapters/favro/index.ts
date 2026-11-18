/**
 * Favro adapter for the projects vertical.
 *
 * Favro exposes a single-host REST API at `https://favro.com/api/v1`,
 * authenticated with HTTP Basic Auth (account email + personal API token) and a
 * required `organizationId` header on every organization-scoped route. There is
 * no OAuth2 authorization-code flow for first-party API access, so credentials
 * are collected through the Connect Link form (email + API token + organization
 * id via `customForm`). The token is stored as `accessToken`; the email and
 * organization id ride on `credentials.extra` so the client can build the Basic
 * header and the `organizationId` header.
 *
 * Canonical mapping (Favro's hierarchy is Organization > Collection > Widget >
 * Card):
 *   - Workspaces ← organizations  GET /organizations, GET /organizations/{id}
 *   - Users      ← users          GET /users, GET /users/{userId}
 *   - Projects   ← widgets        GET /widgets, GET /widgets/{widgetCommonId}
 *   - Tasks      ← cards          GET /cards?widgetCommonId=..., GET /cards/{cardId}
 *   - Comments   ← comments       GET /comments?cardCommonId=..., GET /comments/{id}
 *   - Tags       ← tags           GET /tags, GET /tags/{tagId}
 *
 * Collections are presentational containers above widgets and are folded into
 * project metadata (`collectionIds`) rather than surfaced as a canonical
 * resource.
 *
 * Webhooks: Favro signs each delivery with HMAC-SHA1 of `payloadId + webhookUrl`
 * (base64-encoded) in the `X-Favro-Webhook` header. One event is delivered per
 * HTTP call. See webhook.ts for verification + parsing.
 *
 * Pagination: list endpoints return `{ requestId, page, pages, limit, entities }`
 * at a fixed 100 entities a page, and page via `?requestId=<id>&page=<n>`
 * (0-based) with the `X-Favro-Backend-Identifier` response header echoed.
 * See {@link FavroAdapter.listRows}.
 */
import { connectionScope, cursorPagerKey, customForm, pageByRows } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, refreshCredentials as favroRefresh } from './auth'
import { FavroClient } from './client'
import { DEFAULT_PAGE_SIZE, TOKEN_HELP_URL } from './constants'
import { verifyFavroWebhook, parseFavroWebhookEvents } from './webhook'

import { transformProject, type RawFavroWidget } from './transform/project'
import { transformTask, type RawFavroCard } from './transform/task'
import { transformComment, type RawFavroComment } from './transform/comment'
import { transformTag, type RawFavroTag } from './transform/tag'
import { transformWorkspace, type RawFavroOrganization } from './transform/workspace'
import { transformUser, type RawFavroUser } from './transform/user'

/** Favro paginated collection envelope. */
interface ListResponse<T> {
  requestId?: string
  page?: number
  pages?: number
  limit?: number
  entities?: T[]
}

/** Where the next Favro page is: the first response's requestId, a 0-based page, its backend. */
interface FavroCursor {
  requestId: string
  page: number
  backendId: string | undefined
}

/**
 * Connect Link form: Favro Basic-auth requires the account email and the API
 * token, and every organization-scoped route requires the organization id, so
 * all three are collected and stored on the credential (token as `accessToken`,
 * email + organization id on `extra`).
 */
const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'email',
      label: 'Account email',
      type: 'text',
      placeholder: 'you@example.com',
      required: true,
      helpText: 'The email of the Favro account whose API token you are using.',
    },
    {
      name: 'apiToken',
      label: 'API token',
      type: 'password',
      required: true,
      helpText: `Generate a personal API token from My profile → API Tokens. See ${TOKEN_HELP_URL}`,
    },
    {
      name: 'organizationId',
      label: 'Organization ID',
      type: 'text',
      required: true,
      helpText: 'The Favro organization to read from (required on every API request).',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const email = (fields['email'] ?? '').trim()
    const apiToken = (fields['apiToken'] ?? '').trim()
    const organizationId = (fields['organizationId'] ?? '').trim()
    if (!email) throw new Error('Account email is required.')
    if (!apiToken) throw new Error('API token is required.')
    if (!organizationId) throw new Error('Organization ID is required.')
    return { accessToken: apiToken, extra: { email, organizationId } }
  },
})

export class FavroAdapter implements ProjectsAdapter {
  readonly platform = 'favro'
  readonly version = '0.1.0'

  // Connect Link support — email + API token + organization id form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // No OAuth code flow — Connect Link uses exchangeCredentials. Treat the
    // supplied code as the raw API token for the BaseAdapter contract.
    return { accessToken: (code ?? '').trim() }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return favroRefresh(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyFavroWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseFavroWebhookEvents(payload)
  }

  private client(credentials: Credentials): FavroClient {
    return new FavroClient(credentials)
  }

  /**
   * The caller's page of a Favro list, cut from Favro's 100-entity pages.
   *
   * Favro has no page-size parameter (`limit` is "The number of entities per
   * page. This should always be 100."), and the next page is named by the
   * `requestId` of the first response plus a 0-based `page` index, sent with
   * the `X-Favro-Backend-Identifier` header that response carried
   * (https://favro.com/developer/, "Pagination" and "Routing"). Sending
   * only `limit` returned page 0 for every caller page, so page 2 repeated
   * page 1. `pageByRows` walks the chain and serves exactly rows
   * [(page-1)×limit, page×limit) with `hasMore` exact.
   *
   * Keyed per connection (organization + a token fingerprint, never the
   * email or the token itself) and per filter. The page size is fixed, so the caller's
   * `limit` is left out and walks at different sizes share positions.
   */
  private async listRows<T>(
    credentials: Credentials,
    path: string,
    filters: Record<string, unknown>,
    params: QueryParams,
  ): Promise<T[]> {
    const client = this.client(credentials)
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const org = typeof extra['organizationId'] === 'string' ? extra['organizationId'] : ''
    const key = cursorPagerKey(connectionScope(`favro:${org}`, credentials), path, filters)
    const { items } = await pageByRows<T, FavroCursor>(
      key,
      params,
      async (cursor) => {
        const { data, backendId } = await client.getPage<ListResponse<T>>(
          path,
          cursor ? { ...filters, requestId: cursor.requestId, page: cursor.page } : { ...filters },
          cursor?.backendId,
        )
        const page = typeof data.page === 'number' ? data.page : (cursor?.page ?? 0)
        const pages = typeof data.pages === 'number' ? data.pages : 0
        // Every later page names the ORIGINAL request's requestId ("The requestId
        // returned by the original request to the paged endpoint.").
        const requestId = cursor?.requestId ?? data.requestId
        const next =
          requestId && page + 1 < pages
            ? { requestId, page: page + 1, backendId: backendId ?? cursor?.backendId }
            : undefined
        return { items: data.entities ?? [], next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  // ── Projects (widgets) ─────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const collectionId = params['collection_id']
    const rows = await this.listRows<RawFavroWidget>(
      credentials,
      '/widgets',
      collectionId ? { collectionId: String(collectionId) } : {},
      params,
    )
    return rows.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<RawFavroWidget>(`/widgets/${id}`)
    if (!res || res.widgetCommonId == null) throw new Error(`Favro widget ${id} not found`)
    return transformProject(res)
  }

  // ── Tasks (cards) ──────────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const rows = await this.listRows<RawFavroCard>(
      credentials,
      '/cards',
      { widgetCommonId: projectId },
      params,
    )
    return rows.map((c) => transformTask(c, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // Task.id is cardCommonId (stable cross-board); the single-card endpoint
    // requires the widget-specific cardId, so we must list by cardCommonId and
    // take the first matching instance.
    const res = await this.client(credentials).get<ListResponse<RawFavroCard>>('/cards', {
      cardCommonId: id,
      unique: true,
    })
    const card = (res.entities ?? [])[0]
    if (!card) throw new Error(`Favro card ${id} not found`)
    return transformTask(card)
  }

  // ── Comments ───────────────────────────────────────────────────────────────
  //
  // Comments are scoped to a card via `cardCommonId`. The canonical `taskId`
  // passed in is the card's common id used to list comments.

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const rows = await this.listRows<RawFavroComment>(
      credentials,
      '/comments',
      { cardCommonId: taskId },
      params,
    )
    return rows.map((c) => transformComment(c, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const res = await this.client(credentials).get<RawFavroComment>(`/comments/${id}`)
    if (!res || res.commentId == null) throw new Error(`Favro comment ${id} not found`)
    return transformComment(res)
  }

  // ── Tags ───────────────────────────────────────────────────────────────────
  //
  // Tags are organization-scoped (the `organizationId` header already pins the
  // org); the canonical `workspaceId` argument is not needed by the upstream
  // route, so it is ignored.

  async listTags(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    const rows = await this.listRows<RawFavroTag>(credentials, '/tags', {}, params)
    return rows.map(transformTag)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const res = await this.client(credentials).get<RawFavroTag>(`/tags/${id}`)
    if (!res || res.tagId == null) throw new Error(`Favro tag ${id} not found`)
    return transformTag(res)
  }

  // ── Workspaces (organizations) ─────────────────────────────────────────────

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const rows = await this.listRows<RawFavroOrganization>(
      credentials,
      '/organizations',
      {},
      params,
    )
    return rows.map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<RawFavroOrganization>(`/organizations/${id}`)
    if (!res || res.organizationId == null) throw new Error(`Favro organization ${id} not found`)
    return transformWorkspace(res)
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  //
  // `/users` lists members of the organization pinned by the `organizationId`
  // header; the canonical `workspaceId` argument is the organization id and is
  // threaded onto each user's `workspaceIds`.

  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const rows = await this.listRows<RawFavroUser>(credentials, '/users', {}, params)
    return rows.map((u) => transformUser(u, workspaceId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawFavroUser>(`/users/${id}`)
    if (!res || res.userId == null) throw new Error(`Favro user ${id} not found`)
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const organizationId =
      typeof extra['organizationId'] === 'string' ? extra['organizationId'] : undefined
    return transformUser(res, organizationId)
  }
}

export { DEFAULT_PAGE_SIZE }

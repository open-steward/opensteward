/**
 * Kaiten adapter for the projects vertical.
 *
 * Kaiten is a Kanban/agile project management platform.  Its REST API is
 * available at https://<company>.kaiten.ru/api/latest and is authenticated with
 * a long-lived personal API token (Bearer auth).  There is no OAuth2 flow.
 *
 * Canonical resource mappings:
 *   Space  → Workspace   GET /spaces, GET /spaces/{id}
 *   Board  → Project     GET /spaces/{space_id}/boards (with a workspace), or the
 *                        boards of each space in GET /spaces; getProject finds
 *                        the board in that same GET /spaces walk
 *   Card   → Task        GET /cards?board_id=…, GET /cards/{id}
 *   Comment→ Comment     GET /cards/{card_id}/comments, GET /card-comments/{id}
 *   Tag    → Tag         GET /tags, GET /tags/{id}
 *   User   → User        GET /users, GET /users/{id}
 *
 * Pagination: spaces, cards, tags and users take `limit` (max 100) +
 * `offset` and return a bare array, so a full page is the only next signal
 * (a short page is the end). Card
 * comments and a space's boards document no query parameters and are paged
 * locally. Without a workspace, boards are flattened out of the spaces pages
 * (each space documents its `boards`) and cut to the caller's page by
 * pageByRows.
 *
 * Webhooks: Kaiten supports external webhooks (card:add, card:update,
 * comment:add, …) but does not document a signature-verification scheme, so
 * verifyWebhook / parseWebhookEvents are intentionally omitted here.
 */
import {
  connectionScope,
  cursorPagerKey,
  customForm,
  pageByRows,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  exchangeCode as kaitenExchange,
  refreshCredentials as kaitenRefresh,
} from './auth'
import { KaitenClient } from './client'
import { API_KEY_HELP_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformProject, type RawKaitenBoard } from './transform/project'
import { transformTask, type RawKaitenCard } from './transform/task'
import { transformComment, type RawKaitenComment } from './transform/comment'
import { transformTag, type RawKaitenTag } from './transform/tag'
import { transformWorkspace, type RawKaitenSpace } from './transform/workspace'
import { transformUser, type RawKaitenUser } from './transform/user'

/**
 * Connect Link form: two fields — company base URL + API token.
 * The token is stored as `credentials.accessToken`; the base URL is stored in
 * `credentials.extra.baseUrl`.  Both are required by `KaitenClient`.
 */
const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'baseUrl',
      label: 'Company URL',
      type: 'text',
      required: true,
      placeholder: 'https://yourcompany.kaiten.ru',
      helpText: 'The base URL of your Kaiten instance, e.g. https://yourcompany.kaiten.ru',
    },
    {
      name: 'apiKey',
      label: 'API token',
      type: 'password',
      required: true,
      helpText: `Generate an API token from your Kaiten profile settings. See ${API_KEY_HELP_URL}`,
    },
  ],
  async exchange(fields) {
    const baseUrl = (fields['baseUrl'] ?? '').trim().replace(/\/+$/, '')
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!baseUrl) throw new Error('Company URL is required.')
    if (!apiKey) throw new Error('API token is required.')
    return { accessToken: apiKey, extra: { baseUrl } }
  },
})

export class KaitenAdapter implements ProjectsAdapter {
  readonly platform = 'kaiten'
  readonly version = '0.1.0'

  // Connect Link support — company URL + API-token form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return kaitenExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return kaitenRefresh(credentials)
  }

  private client(credentials: Credentials): KaitenClient {
    return new KaitenClient(credentials)
  }

  /** Row-pager scope: the tenant host plus a fingerprint of this connection's token. */
  private scope(credentials: Credentials): string {
    return connectionScope(String(credentials.extra?.['baseUrl'] ?? ''), credentials)
  }

  /**
   * One page of GET /spaces at the documented maximum: `limit` "a value
   * greater than 100 is treated as 100", `offset` "Number of spaces to skip".
   */
  private async spacesPage(client: KaitenClient, offset: number): Promise<RawKaitenSpace[]> {
    const res = await client.get<RawKaitenSpace[]>('/spaces', { limit: MAX_PAGE_SIZE, offset })
    return Array.isArray(res) ? res : []
  }

  /**
   * One caller page of an offset-paged list. Kaiten: `limit` "Default: 100
   * Max: 100", `offset` "Number of records to skip"; the response is a bare
   * array with no total, so a page shorter than the size sent is the last.
   * A caller limit above 100 is sent as 100 and the page reports that size,
   * so the router judges it (and strides the next offset) at 100.
   */
  private async offsetPage<R>(
    credentials: Credentials,
    path: string,
    filters: Record<string, unknown>,
    params: QueryParams,
  ): Promise<R[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const size = Math.max(1, Math.min(Math.floor(limit), MAX_PAGE_SIZE))
    const res = await this.client(credentials).get<R[]>(path, {
      ...filters,
      limit: size,
      offset: pageOffset(params, size),
    })
    const rows = Array.isArray(res) ? res : []
    reportUpstreamPage(params, {
      hasMore: rows.length >= size,
      ...(size < limit ? { pageSize: size } : {}),
    })
    return rows
  }

  // ── Workspaces (Spaces) ──────────────────────────────────────────────────

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const res = await this.offsetPage<RawKaitenSpace>(credentials, '/spaces', {}, params)
    return res.map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const raw = await this.client(credentials).get<RawKaitenSpace>(`/spaces/${id}`)
    if (!raw || !raw.id) throw new Error(`Kaiten space ${id} not found`)
    return transformWorkspace(raw)
  }

  // ── Projects (Boards) ────────────────────────────────────────────────────

  /**
   * Kaiten documents one board list, per space: "GET
   * https://example.kaiten.ru/api/latest/spaces/{space_id}/boards" with only
   * the `space_id` path parameter, so a workspace's boards are read whole and
   * paged locally. GET /spaces/{space_id} is read alongside for the space's
   * documented `archived` flag, which is the board's status.
   *
   * Without a workspace, the boards come out of GET /spaces, whose every space
   * documents `boards` ("Space boards", each with `space_id`). A space holds
   * any number of boards, so pageByRows cuts the caller's rows out of the
   * spaces pages; a spaces page shorter than 100 is the last.
   */
  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const client = this.client(credentials)
    const workspaceId = params['workspace_id']
    if (workspaceId != null && workspaceId !== '') {
      const sid = encodeURIComponent(String(workspaceId))
      const [space, boards] = await Promise.all([
        client.get<RawKaitenSpace>(`/spaces/${sid}`),
        client.get<RawKaitenBoard[]>(`/spaces/${sid}/boards`),
      ])
      const rows = Array.isArray(boards) ? boards : []
      return pageLocally(rows, params).map((b) => transformProject(b, space))
    }
    const key = cursorPagerKey(this.scope(credentials), 'projects', { pageSize: MAX_PAGE_SIZE })
    const { items } = await pageByRows<Project, number>(
      key,
      params,
      async (offset) => {
        const at = offset ?? 0
        const spaces = await this.spacesPage(client, at)
        return {
          items: spaces.flatMap((s) => (s.boards ?? []).map((b) => transformProject(b, s))),
          next: spaces.length >= MAX_PAGE_SIZE ? at + MAX_PAGE_SIZE : null,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  /**
   * GET /boards/{id} documents no `space_id`, and the space-scoped read
   * (GET /spaces/{space_id}/boards/{id}) needs the space id, so the board is
   * found in the boards of the GET /spaces pages, which carry both.
   */
  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const client = this.client(credentials)
    const wanted = Number(id)
    for (let offset = 0; ; offset += MAX_PAGE_SIZE) {
      const spaces = await this.spacesPage(client, offset)
      for (const s of spaces) {
        const b = (s.boards ?? []).find((x) => x.id === wanted)
        if (b) return transformProject(b, s)
      }
      if (spaces.length < MAX_PAGE_SIZE) break
    }
    throw new Error(`Kaiten board ${id} not found`)
  }

  // ── Tasks (Cards) ────────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const cards = await this.offsetPage<RawKaitenCard>(
      credentials,
      '/cards',
      {
        board_id: Number(projectId),
        // Request description field explicitly (requires the extra param).
        additional_card_fields: 'description',
      },
      params,
    )
    return cards.map((c) => transformTask(c, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const raw = await this.client(credentials).get<RawKaitenCard>(`/cards/${id}`)
    if (!raw || !raw.id) throw new Error(`Kaiten card ${id} not found`)
    return transformTask(raw)
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    // Documents only the card_id path parameter: the whole list, paged here.
    const comments = await this.client(credentials).get<RawKaitenComment[]>(
      `/cards/${taskId}/comments`,
    )
    const live = (Array.isArray(comments) ? comments : []).filter((c) => !c.deleted)
    return pageLocally(live, params).map((c) => transformComment(c, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const raw = await this.client(credentials).get<RawKaitenComment>(`/card-comments/${id}`)
    if (!raw || !raw.id) throw new Error(`Kaiten comment ${id} not found`)
    return transformComment(raw)
  }

  // ── Tags ─────────────────────────────────────────────────────────────────

  async listTags(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    const tags = await this.offsetPage<RawKaitenTag>(credentials, '/tags', {}, params)
    return tags.map(transformTag)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const raw = await this.client(credentials).get<RawKaitenTag>(`/tags/${id}`)
    if (!raw || !raw.id) throw new Error(`Kaiten tag ${id} not found`)
    return transformTag(raw)
  }

  // ── Users ────────────────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const users = await this.offsetPage<RawKaitenUser>(credentials, '/users', {}, params)
    return users.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawKaitenUser>(`/users/${id}`)
    if (!raw || !raw.id) throw new Error(`Kaiten user ${id} not found`)
    return transformUser(raw)
  }
}

export { DEFAULT_PAGE_SIZE }

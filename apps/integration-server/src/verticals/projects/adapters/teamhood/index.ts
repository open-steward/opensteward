/**
 * Teamhood adapter for the projects vertical.
 *
 * Teamhood is a Kanban/Agile project-management tool.
 * Auth: X-ApiKey header (static API key) — no OAuth.
 * API base: https://api-{tenant}.teamhood.com/api/v1
 *
 * Source for every path, parameter and field: Teamhood's own OpenAPI document
 * ("Teamhood API v1"), https://api-demo.teamhood.com/swagger/v1/swagger.json,
 * and https://teamhood.com/knowledge-base/integrations/open-api/api-examples/.
 *
 * Mapping:
 *   Workspace → canonical Workspace (GET /workspaces → {workspaces})
 *   Board     → canonical Project   (GET /workspaces/{id}/boards → {boards})
 *   Item      → canonical Task      (GET /items?BoardId&Skip&Take → {items, nextPageUrl})
 *   User      → canonical User      (GET /users → {users})
 *   Tag       → canonical Tag       (the labels in Entities.Item.tags)
 *
 * Only GET /items pages ("Skip": "How many records to skip", "Take": "How many
 * records to take"). Workspaces, boards and users take no parameters and come
 * back whole, so they are paged locally.
 *
 * Not available in Teamhood public API v1:
 *   Comments — no endpoint; listComments / getComment auto-501.
 *   Webhooks — no documented webhook API; verifyWebhook not implemented.
 */
import {
  DEFAULT_PAGE_LIMIT,
  connectionScope,
  pageByRows,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
  type CursorPage,
  type Credentials,
  type CredentialField,
  type QueryParams,
} from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { TeamhoodClient, teamhoodTenant } from './client'

import { transformProject, type RawTeamhoodBoard } from './transform/project'
import { transformTask, type RawTeamhoodItem } from './transform/task'
import { transformTag } from './transform/tag'
import { transformWorkspace, type RawTeamhoodWorkspace } from './transform/workspace'
import { transformUser, type RawTeamhoodUser } from './transform/user'

/** GetItemsResponse: required ["items", "nextPageUrl"], both nullable. */
interface GetItemsResponse {
  items?: RawTeamhoodItem[] | null
  nextPageUrl?: string | null
}
/** GetAllWorkspacesResponse: required ["workspaces"], nullable. */
interface GetAllWorkspacesResponse {
  workspaces?: RawTeamhoodWorkspace[] | null
}
/** GetBoardsResponse: required ["boards"], nullable. */
interface GetBoardsResponse {
  boards?: RawTeamhoodBoard[] | null
}
/** GetUsersResponse: required ["users"], nullable. */
interface GetUsersResponse {
  users?: RawTeamhoodUser[] | null
}

/**
 * `ModifiedSince`: "Returns items modified since specified date UTC timezone
 * (ISO format, in example 2024-02-05T02:00:00)". Sent in that exact shape, UTC
 * to the second. Dropping the milliseconds moves the bound earlier, never
 * later, so no modified item is missed.
 */
function modifiedSince(d: Date): string {
  return d.toISOString().slice(0, 19)
}

function hasNextPage(res: GetItemsResponse): boolean {
  return typeof res.nextPageUrl === 'string' && res.nextPageUrl !== ''
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TeamhoodAdapterConfig {}

export class TeamhoodAdapter implements ProjectsAdapter {
  readonly platform = 'teamhood'
  readonly version = '0.1.0'

  constructor(_config: TeamhoodAdapterConfig) {}

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return adapterExchangeCredentials(fields)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('teamhood uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): TeamhoodClient {
    return new TeamhoodClient(credentials)
  }

  private async fetchWorkspaces(credentials: Credentials): Promise<RawTeamhoodWorkspace[]> {
    const res = await this.client(credentials).get<GetAllWorkspacesResponse>('/workspaces')
    return res.workspaces ?? []
  }

  private async fetchBoards(
    credentials: Credentials,
    workspaceId: string,
  ): Promise<RawTeamhoodBoard[]> {
    const res = await this.client(credentials).get<GetBoardsResponse>(
      `/workspaces/${encodeURIComponent(workspaceId)}/boards`,
    )
    return res.boards ?? []
  }

  private async fetchUsers(credentials: Credentials): Promise<RawTeamhoodUser[]> {
    const res = await this.client(credentials).get<GetUsersResponse>('/users')
    return res.users ?? []
  }

  // ── Workspaces ────────────────────────────────────────────────────────────

  /** "List all Workspaces": no parameters, every workspace in one response. */
  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const rows = (await this.fetchWorkspaces(credentials)).map(transformWorkspace)
    return pageLocally(rows, params)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<RawTeamhoodWorkspace>(
      `/workspaces/${encodeURIComponent(id)}`,
    )
    return transformWorkspace(res)
  }

  // ── Projects (boards) ─────────────────────────────────────────────────────

  /**
   * Boards of every workspace, in workspace order. "List Boards by Workspace
   * Id" takes no parameters and answers a workspace's boards whole, so each
   * workspace is one upstream page of the stream and `pageByRows` cuts the
   * caller's page out of them. The cursor is the id of the workspace whose
   * boards the page holds.
   */
  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const key = `${connectionScope(`teamhood:${teamhoodTenant(credentials)}`, credentials)}::boards`
    let workspaces: Promise<RawTeamhoodWorkspace[]> | undefined
    const listWorkspaces = (): Promise<RawTeamhoodWorkspace[]> =>
      (workspaces ??= this.fetchWorkspaces(credentials))
    const fetch = async (cursor: string | undefined): Promise<CursorPage<Project, string>> => {
      const all = await listWorkspaces()
      const i = cursor === undefined ? 0 : all.findIndex((w) => w.id === cursor)
      if (i < 0)
        throw new Error(`teamhood workspace ${cursor} is no longer listed; list the boards again`)
      const ws = all[i]
      if (!ws) return { items: [] }
      const boards = await this.fetchBoards(credentials, ws.id)
      return {
        items: boards.map((b) => transformProject(b, ws.id)),
        next: all[i + 1]?.id,
      }
    }
    const { items } = await pageByRows<Project, string>(key, params, fetch)
    return items
  }

  /** There is no GET /boards/{id}: the board is found among its workspace's boards. */
  async getProject(credentials: Credentials, id: string): Promise<Project> {
    for (const ws of await this.fetchWorkspaces(credentials)) {
      const board = (await this.fetchBoards(credentials, ws.id)).find((b) => b.id === id)
      if (board) return transformProject(board, ws.id)
    }
    throw Object.assign(new Error(`teamhood board ${id} not found`), { statusCode: 404 })
  }

  // ── Tasks (items) ─────────────────────────────────────────────────────────

  /**
   * "Query items" filtered by `BoardId`, paged by `Skip` / `Take`. The next
   * page exists while the response names a `nextPageUrl`. The docs give no
   * maximum for `Take`, so the caller's limit is sent as is.
   *
   * Should the server still answer fewer rows than `Take` while naming a
   * `nextPageUrl` (an undocumented cap), the rest of the caller's page is
   * asked for from where the rows received end, so the page is still rows
   * `(page-1)*limit` onward and the next caller page skips nothing.
   */
  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const client = this.client(credentials)
    const take = params.limit ?? DEFAULT_PAGE_LIMIT
    const skip = pageOffset(params, take)
    const rows: RawTeamhoodItem[] = []
    let more: boolean
    do {
      const res = await client.get<GetItemsResponse>('/items', {
        BoardId: projectId,
        ...(params.updatedAfter ? { ModifiedSince: modifiedSince(params.updatedAfter) } : {}),
        Skip: skip + rows.length,
        Take: take - rows.length,
      })
      const items = res.items ?? []
      rows.push(...items)
      // An empty page ends the walk even if it names a nextPageUrl: asking again
      // from the same Skip would only repeat it.
      more = items.length > 0 && hasNextPage(res)
    } while (more && rows.length < take)
    reportUpstreamPage(params, { hasMore: more })
    return rows.map((item) => transformTask(item, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<RawTeamhoodItem>(
      `/items/${encodeURIComponent(id)}`,
    )
    return transformTask(res)
  }

  // ── Tags (the labels on items) ────────────────────────────────────────────

  /**
   * Teamhood has no tag endpoint; a tag exists as a label in an item's `tags`.
   * Every item of the workspace ("Query items" filtered by `WorkspaceId`) is
   * read, following `nextPageUrl` with `Skip` advanced by the rows received,
   * and the distinct labels, in order of first appearance, are paged locally.
   */
  async listTags(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    const client = this.client(credentials)
    const labels = new Set<string>()
    let skip = 0
    for (;;) {
      const res = await client.get<GetItemsResponse>('/items', {
        WorkspaceId: workspaceId,
        ...(skip > 0 ? { Skip: skip } : {}),
      })
      const items = res.items ?? []
      for (const item of items)
        for (const t of item.tags ?? []) if (typeof t === 'string' && t !== '') labels.add(t)
      if (!hasNextPage(res) || items.length === 0) break
      skip += items.length
    }
    const rows = [...labels].map((name) => transformTag({ name }, workspaceId))
    return pageLocally(rows, params)
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  /**
   * "List all Users" takes no parameters and returns the whole company
   * account. A workspace's users are those whose documented
   * `accessibleWorkspaces` names it; a user whose list is null shows no
   * workspace and is left out.
   */
  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const rows = (await this.fetchUsers(credentials))
      .filter((u) => (u.accessibleWorkspaces ?? []).includes(workspaceId))
      .map(transformUser)
    return pageLocally(rows, params)
  }

  /** There is no GET /users/{id}: the user is found in "List all Users". */
  async getUser(credentials: Credentials, id: string): Promise<User> {
    const user = (await this.fetchUsers(credentials)).find((u) => u.id === id)
    if (!user) throw Object.assign(new Error(`teamhood user ${id} not found`), { statusCode: 404 })
    return transformUser(user)
  }
}

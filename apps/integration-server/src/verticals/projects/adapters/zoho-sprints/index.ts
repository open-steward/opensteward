/**
 * Zoho Sprints adapter for the projects vertical.
 *
 * Zoho Sprints is an agile project management tool built around
 * teams → projects → sprints → items (work items).
 *
 * API base: https://sprintsapi.zoho.com/zsapi
 * Auth:     Zoho-oauthtoken OAuth 2.0 (accounts.zoho.com)
 * Pagination: index (1-based) + range query params
 *
 * Resource mapping:
 *   Workspace  → Zoho Sprints Team  (GET /zsapi/teams/)
 *   Project    → Zoho Sprints Project (GET /zsapi/team/{teamId}/projects/)
 *   Task       → Zoho Sprints Item   (items across sprints)
 *   Comment    → Zoho Sprints Activity (item activity feed, type=comment)
 *   User       → Team Member (GET /zsapi/team/{teamId}/users/)
 *
 * Tags and standalone getComment/getTag are not offered by the API
 * and will auto-501 via the base interface optionals.
 */
import {
  pageLocally,
  pageOffset,
  reportUpstreamPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  exchangeCode as zohoSprintsExchange,
  refreshCredentials as zohoSprintsRefresh,
} from './auth'
import { ZohoSprintsClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, USERS_MAX_RANGE } from './constants'

import { transformProject, type RawZohoSprintsProject } from './transform/project'
import { transformTask, type RawZohoSprintsItem } from './transform/task'
import { transformComment, type RawZohoSprintsActivity } from './transform/comment'
import { transformWorkspace, type RawZohoSprintsTeam } from './transform/workspace'
import { transformUsersPage, type ZohoSprintsUsersPage } from './transform/user'

export interface ZohoSprintsAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

// ── API response shapes ───────────────────────────────────────────────────────

/**
 * GET /zsapi/teams/ response
 * { status: 'success', portals: [...], myTeamId: string }
 */
interface TeamsResponse {
  status?: string
  portals?: RawZohoSprintsTeam[]
  myTeamId?: string
}

/**
 * GET /zsapi/team/{teamId}/projects/?action=data
 * { status: 'success', projects: [...] }
 */
interface ProjectsResponse {
  status?: string
  projects?: RawZohoSprintsProject[]
}

/**
 * GET /zsapi/team/{teamId}/projects/{projectId}/?action=details
 * { status: 'success', project: {...} }
 */
interface ProjectResponse {
  status?: string
  project?: RawZohoSprintsProject
}

/**
 * GET /zsapi/team/{teamId}/projects/{projectId}/sprints/?action=data
 * { status: 'success', sprints: [...] }
 */
interface RawZohoSprintsSprint {
  sprintId: string
  name?: string
  projId?: string
  status?: number | string
  startDate?: string | number
  endDate?: string | number
  [key: string]: unknown
}

interface SprintsResponse {
  status?: string
  sprints?: RawZohoSprintsSprint[]
}

/**
 * GET /zsapi/team/{teamId}/projects/{projectId}/sprints/{sprintId}/item/?action=data
 * { status: 'success', items: [...] }
 */
interface ItemsResponse {
  status?: string
  items?: RawZohoSprintsItem[]
  next?: boolean
}

/**
 * GET /zsapi/team/{teamId}/projects/{projectId}/sprints/{sprintId}/item/{itemId}/activity/
 * { status: 'success', activity: [...] }
 */
interface ActivityResponse {
  status?: string
  activity?: RawZohoSprintsActivity[]
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class ZohoSprintsAdapter implements ProjectsAdapter {
  readonly platform = 'zoho-sprints'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ZohoSprintsAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return zohoSprintsExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return zohoSprintsRefresh(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): ZohoSprintsClient {
    return new ZohoSprintsClient(credentials)
  }

  /** Build pagination params for Zoho Sprints: index (1-based) + range. */
  private pageParams(params: QueryParams): Record<string, unknown> {
    const index = params['cursor'] ? Number(params['cursor']) : 1
    return {
      index: isNaN(index) ? 1 : index,
      range: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // ── Workspaces (Teams) ────────────────────────────────────────────────────

  /**
   * GET /teams/ documents no paging parameter and returns every workspace
   * ("Fetch the list of all the workspaces in which you are associated."),
   * so the whole collection is paged locally by page/limit.
   */
  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    return pageLocally(await this.allWorkspaces(credentials), params)
  }

  /** Every workspace (team) the user belongs to, from the unpaginated GET /teams/. */
  private async allWorkspaces(credentials: Credentials): Promise<Workspace[]> {
    const res = await this.client(credentials).get<TeamsResponse>('/teams/')
    const portals = res.portals ?? []
    // The /teams/ response returns portals with zsoid as the team ID
    return portals.map((p) => {
      // Normalise: zsoid is the canonical team ID used in subsequent calls
      const raw = p as Record<string, unknown>
      const normalised: RawZohoSprintsTeam = {
        ...p,
        teamId: (raw['zsoid'] as string | undefined) ?? p.teamId,
        name: (raw['teamName'] as string | undefined) ?? p.name,
        zsoid: raw['zsoid'] as string | undefined,
      }
      return transformWorkspace(normalised)
    })
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    // Zoho Sprints has no single-team fetch; re-use list and filter
    const all = await this.allWorkspaces(credentials)
    const found = all.find((w) => w.id === id)
    if (!found) throw new Error(`Zoho Sprints team ${id} not found`)
    return found
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const teamId = String(params['workspace_id'] ?? '')
    if (!teamId) throw new Error('Zoho Sprints listProjects requires workspace_id (teamId)')
    const res = await this.client(credentials).get<ProjectsResponse>(`/team/${teamId}/projects/`, {
      action: 'data',
      ...this.pageParams(params),
    })
    return (res.projects ?? []).map((p) => transformProject(p, teamId))
  }

  async getProject(
    credentials: Credentials,
    id: string,
    params: QueryParams = {},
  ): Promise<Project> {
    const teamId = String(params['workspace_id'] ?? '')
    if (!teamId) throw new Error('Zoho Sprints getProject requires workspace_id (teamId)')
    const res = await this.client(credentials).get<ProjectResponse>(
      `/team/${teamId}/projects/${id}/`,
      { action: 'details' },
    )
    if (!res.project) throw new Error(`Zoho Sprints project ${id} not found`)
    return transformProject(res.project, teamId)
  }

  // ── Tasks (Items) ─────────────────────────────────────────────────────────
  //
  // Zoho Sprints items live inside sprints. To list items for a project we
  // first enumerate all sprints (active + closed), then collect items from
  // each sprint. Backlog items are returned by a separate endpoint.

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const teamId = String(params['workspace_id'] ?? '')
    if (!teamId) throw new Error('Zoho Sprints listTasks requires workspace_id (teamId)')
    const http = this.client(credentials)

    // 1. Fetch all sprints for the project
    const sprintsRes = await http.get<SprintsResponse>(
      `/team/${teamId}/projects/${projectId}/sprints/`,
      { action: 'data', index: 1, range: 100 },
    )
    const sprints = sprintsRes.sprints ?? []

    const allItems: Task[] = []

    // 2. Collect items from each sprint
    for (const sprint of sprints) {
      const itemsRes = await http.get<ItemsResponse>(
        `/team/${teamId}/projects/${projectId}/sprints/${sprint.sprintId}/item/`,
        { action: 'data', ...this.pageParams(params) },
      )
      const items = (itemsRes.items ?? []).map((item) =>
        transformTask({ ...item, sprintId: sprint.sprintId, projId: projectId }, projectId),
      )
      allItems.push(...items)
    }

    // 3. Also fetch backlog items
    const backlogRes = await http
      .get<ItemsResponse>(`/team/${teamId}/projects/${projectId}/backlog/item/`, {
        action: 'data',
        index: 1,
        range: DEFAULT_PAGE_SIZE,
      })
      .catch(() => ({ items: [] as RawZohoSprintsItem[] }))
    const backlogItems = (backlogRes.items ?? []).map((item) =>
      transformTask({ ...item, projId: projectId }, projectId),
    )
    allItems.push(...backlogItems)

    return allItems
  }

  async getTask(credentials: Credentials, id: string, params: QueryParams = {}): Promise<Task> {
    const teamId = String(params['workspace_id'] ?? '')
    const projectId = String(params['project_id'] ?? '')
    const sprintId = String(params['sprint_id'] ?? '')
    if (!teamId || !projectId || !sprintId) {
      throw new Error('Zoho Sprints getTask requires workspace_id, project_id, and sprint_id')
    }
    const res = await this.client(credentials).get<{ status?: string; item?: RawZohoSprintsItem }>(
      `/team/${teamId}/projects/${projectId}/sprints/${sprintId}/item/${id}/`,
      { action: 'details' },
    )
    if (!res.item) throw new Error(`Zoho Sprints item ${id} not found`)
    return transformTask({ ...res.item, sprintId, projId: projectId }, projectId)
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const teamId = String(params['workspace_id'] ?? '')
    const projectId = String(params['project_id'] ?? '')
    const sprintId = String(params['sprint_id'] ?? '')
    if (!teamId || !projectId || !sprintId) {
      throw new Error('Zoho Sprints listComments requires workspace_id, project_id, and sprint_id')
    }
    const res = await this.client(credentials).get<ActivityResponse>(
      `/team/${teamId}/projects/${projectId}/sprints/${sprintId}/item/${taskId}/activity/`,
      { action: 'data', ...this.pageParams(params) },
    )
    // Filter to only comment-type activities (type === 1 or type contains 'comment')
    return (res.activity ?? [])
      .filter(
        (a) => a.type === 1 || a.type === '1' || String(a.type).toLowerCase().includes('comment'),
      )
      .map((a) => transformComment(a, taskId, projectId))
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  /**
   * "Get workspace users": GET /team/{teamId}/users/ with action=data, index
   * ("Index from which the listing has to start. Valid Index starts from 1.")
   * and range ("No. of records that have to be listed. The maximum limit is
   * 250."). `next` is "set to 'true'" when more data follows the range.
   * Scope ZohoSprints.teamusers.READ; "Applicable only for Admins."
   */
  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const range = Math.min(limit, USERS_MAX_RANGE)
    const res = await this.usersPage(credentials, workspaceId, pageOffset(params, range) + 1, range)
    reportUpstreamPage(params, {
      ...(typeof res.next === 'boolean' ? { hasMore: res.next } : {}),
      ...(range < limit ? { pageSize: range } : {}),
    })
    return transformUsersPage(res, workspaceId)
  }

  private async usersPage(
    credentials: Credentials,
    workspaceId: string,
    index: number,
    range: number,
  ): Promise<ZohoSprintsUsersPage> {
    return this.client(credentials).get<ZohoSprintsUsersPage>(`/team/${workspaceId}/users/`, {
      action: 'data',
      index,
      range,
    })
  }

  /** No single-user GET is documented, so walk the workspace user pages until the id appears. */
  async getUser(credentials: Credentials, id: string, params: QueryParams = {}): Promise<User> {
    const workspaceId = String(params['workspace_id'] ?? '')
    if (!workspaceId) throw new Error('Zoho Sprints getUser requires workspace_id (teamId)')
    for (let index = 1; ; index += USERS_MAX_RANGE) {
      const res = await this.usersPage(credentials, workspaceId, index, USERS_MAX_RANGE)
      const found = transformUsersPage(res, workspaceId).find((u) => u.id === id)
      if (found) return found
      if (res.next !== true || (res.userIds ?? []).length === 0) break
    }
    throw new Error(`Zoho Sprints user ${id} not found`)
  }
}

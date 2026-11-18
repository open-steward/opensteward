/**
 * WorkBoard adapter for the projects vertical.
 *
 * WorkBoard is an OKR / strategy-execution platform. Its v1 REST API
 * (https://apidocs.myworkboard.com/openapi.json, "WorkBoard's production
 * server API root is https://www.myworkboard.com/wb/apis.") maps as:
 *
 *   Goals   → canonical Projects   (GET /wb/apis/goal, GET /wb/apis/goal/{goal_id})
 *   Metrics → canonical Tasks      (GET /wb/apis/metric?goal_id=, GET /wb/apis/metric/{metric_id})
 *   Teams   → canonical Workspaces (GET /wb/apis/team)
 *   Team members → canonical Users (GET /wb/apis/team?team_id=), GET /wb/apis/user/{user_id}
 *   Tags    → canonical Tags       (GET /wb/apis/tags/{id})
 *
 * Every documented response is `{ success, message, data: { totalCount,
 * <resource>: ... } }`: `data` is an object, never the array itself.
 *
 * Auth: OAuth 2.0. Token exchange uses `client_hash` (not `client_secret`).
 * Auth header: `Authorization: bearer {access_token}`
 *
 * WorkBoard does not document a webhook signature scheme; verifyWebhook /
 * parseWebhookEvents are intentionally omitted (auto-501 via interface).
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import { buildAuthUrl, exchangeCode as wbExchange, refreshCredentials as wbRefresh } from './auth'
import { WorkboardClient } from './client'
import { API_BASE_URL, DEFAULT_SCOPES, WB_DEFAULT_LIMIT } from './constants'

import { transformProject, type RawWorkboardGoal } from './transform/project'
import { transformTask, type RawWorkboardMetric } from './transform/task'
import { transformTag, type RawWorkboardTag } from './transform/tag'
import { transformWorkspace, type RawWorkboardTeam } from './transform/workspace'
import { transformTeamMember, transformUser, type RawWorkboardUser } from './transform/user'

export interface WorkboardAdapterConfig {
  clientId: string
  /**
   * WorkBoard calls this `client_hash` in their OAuth token exchange.
   * Pass the app secret from the WorkBoard developer portal.
   */
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** The documented envelope: `{ success, message, data: { totalCount, ... } }`. */
interface WbResponse<D> {
  success?: boolean
  message?: string
  data?: D & { totalCount?: number }
}

/** GET /wb/apis/goal with no id or team: "Returns if no `goal_id` or `team_id` is included". */
interface WbGoalOwner {
  user_id?: string
  people_goals?: RawWorkboardGoal[]
}

/** Not-yet-supported single-tag read keeps its original shape (out of scope here). */
interface WbGetResponse<T> {
  data?: T
  [key: string]: unknown
}

/** Both goal states: `goal_status` "set `goal_status` to the comma separated values: "1,2"". */
const ALL_GOAL_STATUSES = '1,2'

function notFound(what: string, id: string): Error {
  return Object.assign(new Error(`WorkBoard ${what} ${id} not found`), {
    statusCode: 404,
    code: 'NOT_FOUND',
  })
}

function truncated(what: string, got: number, total: number): Error {
  return Object.assign(
    new Error(
      `WorkBoard returned ${got} ${what} of totalCount ${total}; the rest cannot be reached`,
    ),
    { statusCode: 502, code: 'UPSTREAM_ERROR' },
  )
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export class WorkboardAdapter implements ProjectsAdapter {
  readonly platform = 'workboard'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: WorkboardAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return wbExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return wbRefresh(credentials)
  }

  private client(credentials: Credentials): WorkboardClient {
    return new WorkboardClient(credentials)
  }

  // ── Projects (Goals) ───────────────────────────────────────────────────────

  /**
   * GET /wb/apis/goal with neither `goal_id` nor `team_id` returns
   * `data.goal` as an array of users, each holding its goals in
   * `people_goals`, and pages by `limit` ("The default value is 15.") and
   * `offset` ("Specify the starting point for the results returned.").
   *
   * The docs do not say whether `limit`/`offset` count users or goals (the
   * `limit` text reads "The number of tags returned per page"), nor which one
   * `totalCount` counts. So the goals are flattened and cut to the caller's
   * page by pageByRows, over upstream pages of the documented default size
   * 15, striding `offset` by 15. That tiles the list in either unit. A short
   * page is not an end signal in the goal unit, so the walk ends only on a
   * page with no users.
   */
  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope(API_BASE_URL, credentials), 'goals', {
      goal_status: ALL_GOAL_STATUSES,
      limit: WB_DEFAULT_LIMIT,
    })
    const { items } = await pageByRows<Project, number>(
      key,
      params,
      async (cursor) => {
        const offset = cursor ?? 0
        const res = await client.get<WbResponse<{ goal?: WbGoalOwner[] }>>('/wb/apis/goal', {
          goal_status: ALL_GOAL_STATUSES,
          limit: WB_DEFAULT_LIMIT,
          offset,
        })
        const owners = Array.isArray(res.data?.goal) ? res.data.goal : []
        return {
          items: owners.flatMap((o) => (o.people_goals ?? []).map(transformProject)),
          next: owners.length === 0 ? null : offset + WB_DEFAULT_LIMIT,
        }
      },
      { defaultLimit: WB_DEFAULT_LIMIT },
    )
    return items
  }

  /** GET /wb/apis/goal/{goal_id_path}: `data.goal` is "A single goal object." */
  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<WbResponse<{ goal?: RawWorkboardGoal }>>(
      `/wb/apis/goal/${encodeURIComponent(id)}`,
    )
    const goal = res.data?.goal
    if (!isRecord(goal)) throw notFound('goal', id)
    return transformProject(goal)
  }

  // ── Tasks (Metrics) ───────────────────────────────────────────────────────

  /**
   * GET /wb/apis/metric?goal_id= ("Include this parameter to return metrics
   * from the specified goal only."). `limit`/`offset` apply only "when used
   * with `team_id`", so the goal's metrics come back whole and are paged
   * locally.
   */
  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const res = await this.client(credentials).get<WbResponse<{ metric?: RawWorkboardMetric[] }>>(
      '/wb/apis/metric',
      { goal_id: projectId },
    )
    const rows = Array.isArray(res.data?.metric) ? res.data.metric : []
    // `limit` also reads "The default value is 15." If the server applied it
    // here, paging locally would report a cut list as complete, so the
    // documented `data.totalCount` must not exceed what came back.
    const total = res.data?.totalCount
    if (typeof total === 'number' && total > rows.length) {
      throw truncated(`goal ${projectId} metrics`, rows.length, total)
    }
    return pageLocally(rows, params).map((m) => transformTask(m, projectId))
  }

  /** GET /wb/apis/metric/{metric_id_path}: "Returns a single metric object". */
  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<WbResponse<{ metric?: RawWorkboardMetric }>>(
      `/wb/apis/metric/${encodeURIComponent(id)}`,
    )
    const metric = res.data?.metric
    if (!isRecord(metric)) throw notFound('metric', id)
    return transformTask(metric)
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const res = await this.client(credentials).get<WbGetResponse<RawWorkboardTag>>(
      `/wb/apis/tags/${id}`,
    )
    if (!res.data) throw new Error(`WorkBoard tag ${id} not found`)
    return transformTag(res.data)
  }

  // ── Workspaces (Teams) ────────────────────────────────────────────────────

  /**
   * GET /wb/apis/team: "If you do not include this parameter [team_id], the
   * request will return all teams to which the authenticated user belongs",
   * paged by `offset` and `limit` ("The number of teams returned per page").
   * No maximum is documented, so the caller's limit is sent as is, and
   * `data.totalCount` ends the list.
   */
  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const limit = Math.max(1, Math.floor(params.limit ?? WB_DEFAULT_LIMIT))
    const offset = pageOffset(params, limit)
    const res = await this.client(credentials).get<WbResponse<{ team?: RawWorkboardTeam[] }>>(
      '/wb/apis/team',
      { limit, offset },
    )
    const rows = Array.isArray(res.data?.team) ? res.data.team : []
    const total = res.data?.totalCount
    // No maximum `limit` is documented. A short page that stops before
    // `totalCount` means the server capped the size, and the next page's
    // offset would skip rows, so it is refused rather than served.
    if (typeof total === 'number' && rows.length < limit && offset + rows.length < total) {
      throw truncated(`teams at offset ${offset}`, rows.length, total)
    }
    if (typeof total === 'number') {
      reportUpstreamPage(params, { totalCount: total, hasMore: offset + rows.length < total })
    }
    return rows.map(transformWorkspace)
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  /**
   * A team's members: GET /wb/apis/team?team_id= returns "a single object
   * when `team_id` is passed", whose `team_members` array is "Only returned
   * on a request where a single team object is returned". No paging applies
   * to it, so the members are paged locally.
   */
  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const res = await this.client(credentials).get<WbResponse<{ team?: RawWorkboardTeam }>>(
      '/wb/apis/team',
      { team_id: workspaceId },
    )
    const team = res.data?.team
    if (!isRecord(team)) throw notFound('team', workspaceId)
    const members = Array.isArray(team.team_members) ? team.team_members : []
    return pageLocally(members, params).map((m) => transformTeamMember(m, workspaceId))
  }

  /** GET /wb/apis/user/{user_id_path} ("Data-Admin: Get user by `user_id_path`"). */
  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<WbResponse<{ user?: RawWorkboardUser }>>(
      `/wb/apis/user/${encodeURIComponent(id)}`,
    )
    const user = res.data?.user
    if (!isRecord(user)) throw notFound('user', id)
    return transformUser(user)
  }
}

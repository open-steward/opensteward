/**
 * TAPD adapter for the projects vertical.
 *
 * TAPD exposes a REST API at `https://api.tapd.cn`, authenticated with
 * HTTP Basic Auth using an application ID and application secret registered
 * on the TAPD open platform (tapd.cn → 开放平台 → 应用管理).
 *
 * There is no OAuth2 authorization-code flow for first-party API access, so
 * credentials are collected through the Connect Link form (a two-field form
 * for apiUser + apiPassword via `customForm`).  Both values are stored
 * concatenated as `apiUser:apiPassword` in `credentials.accessToken`.
 *
 * Canonical mapping:
 *   Workspace  ← TAPD workspace (project)   GET /workspaces/projects
 *   Project    ← TAPD workspace (project)   GET /workspaces/projects  (same objects)
 *   Task       ← TAPD story (requirement)   GET /stories
 *   Comment    ← TAPD comment (on a story)  GET /comments
 *   Tag        ← TAPD label                 GET /label
 *   User       ← TAPD workspace member      GET /workspaces/users
 *
 * TAPD does not expose signed inbound webhooks in its public API, so
 * verifyWebhook / parseWebhookEvents are intentionally NOT implemented.
 *
 * Pagination: page-number based — `page` (1-based) + `limit` (≤ 200).
 * Response envelope: { "status": 1, "data": [...], "info": "success" }
 * List items are wrapped: [ { "Story": {...} }, ... ]
 *
 * Docs: https://open.tapd.cn/document/api-doc/
 */
import { customForm, pageLocally, reportUpstreamPage } from '@opensteward/shared'
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
  exchangeCode as tapdExchange,
  refreshCredentials as tapdRefresh,
} from './auth'
import { TapdClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, TOKEN_HELP_URL } from './constants'

import { transformProject, type RawTapdProject } from './transform/project'
import { transformTask, type RawTapdStory } from './transform/task'
import { transformComment, type RawTapdComment } from './transform/comment'
import { transformTag, type RawTapdLabel } from './transform/tag'
import { transformWorkspace, type RawTapdWorkspace } from './transform/workspace'
import { transformUser, type RawTapdUser } from './transform/user'

/** Connect Link form: apiUser (application ID) + apiPassword (application secret). */
const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'apiUser',
      label: 'Application ID (api_user)',
      type: 'text',
      placeholder: '1111112222333334',
      helpText: `Find in TAPD open platform → Application Management. See ${TOKEN_HELP_URL}`,
      required: true,
    },
    {
      name: 'apiPassword',
      label: 'Application Secret (api_password)',
      type: 'password',
      placeholder: '••••••••••••••••',
      helpText: 'The application secret key paired with the application ID above.',
      required: true,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const user = (fields['apiUser'] ?? '').trim()
    const pass = (fields['apiPassword'] ?? '').trim()
    if (!user) throw new Error('Application ID (api_user) is required.')
    if (!pass) throw new Error('Application Secret (api_password) is required.')
    // Store as colon-separated so TapdClient can reconstruct Basic Auth.
    return { accessToken: `${user}:${pass}` }
  },
})

/**
 * Member columns requested from GET /workspaces/users. Documented:
 * "fields 否 string 需要查的字段值 user,user_id,role_id,name,email,real_join_time 可选，以,分隔".
 */
const USER_FIELDS = 'user,role_id,name,email,real_join_time'

/**
 * Sort sent on the paged /comments and /label calls so page N is stable
 * across calls. Both documents: "order 否 string 排序规则，规则：字段名 ASC或者DESC，
 * 然后 urlencode 如按创建时间逆序：order=created%20desc". `id` is the unique
 * documented key of both resources (axios urlencodes the space).
 */
const PAGE_ORDER = 'id asc'

/**
 * Split a scoped `{workspace_id}:{id}` id. TAPD reads of comments, labels
 * and members all require "workspace_id 是 integer", which a bare id lacks.
 */
function splitScopedId(value: string): { workspaceId: string; id: string } | undefined {
  const at = value.indexOf(':')
  if (at <= 0) return undefined
  const workspaceId = value.slice(0, at)
  const id = value.slice(at + 1)
  if (!/^\d+$/.test(workspaceId) || !id) return undefined
  return { workspaceId, id }
}

/** A refusal raised before any request is sent. */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class TapdAdapter implements ProjectsAdapter {
  readonly platform = 'tapd'
  readonly version = '0.1.0'

  // Connect Link support — two-field Basic Auth form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return tapdExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return tapdRefresh(credentials)
  }

  private client(credentials: Credentials): TapdClient {
    return new TapdClient(credentials)
  }

  /**
   * One caller page of a TAPD list that pages by `limit` + `page`
   * (/stories: "可通过传 limit 参数设置，最大取 200。也可以传 page 参数翻页").
   * The limit is clamped to 200 and reported as the page size when clamped.
   * TAPD returns no total or next link, so only a short page is reported as
   * the end; a full page leaves `hasMore` unknown.
   */
  private pageParams(params: QueryParams): { limit: number; page: number } {
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const limit = Math.min(Math.max(Math.floor(asked), 1), MAX_PAGE_SIZE)
    const legacy = params['cursor'] ? Number(params['cursor']) : undefined
    const raw = params.page ?? legacy ?? 1
    const page = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1
    if (limit < asked) reportUpstreamPage(params, { pageSize: limit })
    return { limit, page }
  }

  private reportShortPage(params: QueryParams, returned: number, limit: number): void {
    if (returned < limit) reportUpstreamPage(params, { hasMore: false })
  }

  /**
   * Every workspace of a company. GET /workspaces/projects has no paging:
   * "返回符合查询条件的所有项目（无分页）" — so it is sent only company_id.
   */
  private async allCompanyWorkspaces<T>(
    credentials: Credentials,
    companyId: unknown,
  ): Promise<T[]> {
    return this.client(credentials).getList<T>('/workspaces/projects', 'Workspace', {
      company_id: String(companyId),
    })
  }

  // ── Projects (TAPD workspaces) ───────────────────────────────────────────
  //
  // TAPD "workspace" is what other tools call a "project".  The list is
  // scoped by company_id, which we read from params or from the stored
  // extra credentials.

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const companyId = params['company_id'] ?? credentials.extra?.['companyId']
    if (!companyId) {
      // Fall back to fetching the single workspace by workspace_id if provided.
      const workspaceId = params['workspace_id']
      if (!workspaceId) return pageLocally([], params)
      const item = await this.client(credentials).get<{ Workspace: RawTapdProject }>(
        '/workspaces/info',
        { workspace_id: String(workspaceId) },
      )
      const ws = (item as unknown as { Workspace?: RawTapdProject })?.Workspace
      return pageLocally(ws ? [transformProject(ws)] : [], params)
    }
    const items = await this.allCompanyWorkspaces<RawTapdProject>(credentials, companyId)
    return pageLocally(items.map(transformProject), params)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<{ Workspace?: RawTapdProject }>(
      '/workspaces/info',
      { workspace_id: id },
    )
    const ws = (res as unknown as { Workspace?: RawTapdProject })?.Workspace
    if (!ws) throw new Error(`TAPD workspace ${id} not found`)
    return transformProject(ws)
  }

  // ── Tasks (TAPD stories) ─────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const { limit, page } = this.pageParams(params)
    const items = await this.client(credentials).getList<RawTapdStory>('/stories', 'Story', {
      limit,
      page,
      workspace_id: projectId,
    })
    this.reportShortPage(params, items.length, limit)
    return items.map((s) => transformTask(s, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // TAPD story GET-by-id requires workspace_id; without it we search by id.
    const items = await this.client(credentials).getList<RawTapdStory>('/stories', 'Story', {
      id,
      limit: 1,
    })
    const story = items[0]
    if (!story) throw new Error(`TAPD story ${id} not found`)
    return transformTask(story)
  }

  // ── Comments ─────────────────────────────────────────────────────────────
  //
  // GET https://api.tapd.cn/comments requires the workspace:
  //   "workspace_id 是 integer 项目ID"
  // and filters by "entry_type 否 string 评论类型（取值： bug、 bug_remark …、
  // stories、 tasks …）" + "entry_id 否 integer 评论所依附的业务对象实体id".
  // A bare story id does not name its workspace, so the task id must be the
  // scoped `{workspace_id}:{story_id}`; anything else is refused unsent.
  // (https://open.tapd.cn/document/api-doc/API%E6%96%87%E6%A1%A3/api_reference/comment/get_comments.html)

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const scoped = splitScopedId(taskId)
    if (!scoped) {
      throw notSupported(
        `TAPD cannot list comments for task "${taskId}": GET /comments requires ` +
          `"workspace_id 是 integer 项目ID"; pass the task id as "{workspace_id}:{story_id}"`,
      )
    }
    const { limit, page } = this.pageParams(params)
    const items = await this.client(credentials).getList<RawTapdComment>('/comments', 'Comment', {
      workspace_id: scoped.workspaceId,
      entry_type: 'stories',
      entry_id: scoped.id,
      limit,
      page,
      order: PAGE_ORDER,
    })
    this.reportShortPage(params, items.length, limit)
    return items.map((c) => transformComment(c, scoped.workspaceId))
  }

  /** `id` is the `{workspace_id}:{comment_id}` that listComments returns. */
  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const scoped = splitScopedId(id)
    if (!scoped) {
      throw notSupported(
        `TAPD cannot read comment "${id}": GET /comments requires "workspace_id 是 integer 项目ID"; ` +
          'pass the id as "{workspace_id}:{comment_id}"',
      )
    }
    const items = await this.client(credentials).getList<RawTapdComment>('/comments', 'Comment', {
      workspace_id: scoped.workspaceId,
      id: scoped.id,
    })
    const comment = items.find((c) => c.id === scoped.id)
    if (!comment) throw new Error(`TAPD comment ${id} not found`)
    return transformComment(comment, scoped.workspaceId)
  }

  // ── Tags (TAPD labels) ───────────────────────────────────────────────────
  //
  // GET https://api.tapd.cn/label — "返回符合查询条件的所有自定义标签（分页显示，
  // 默认一页30条）", "可通过传 limit 参数设置，最大取 200。也可以传 page 参数翻页",
  // "workspace_id 是 integer 项目ID", "id 否 integer id 支持多ID查询".
  // (https://open.tapd.cn/document/api-doc/API%E6%96%87%E6%A1%A3/api_reference/label/query_label.html)

  async listTags(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    const { limit, page } = this.pageParams(params)
    const items = await this.client(credentials).getList<RawTapdLabel>('/label', 'LabelPool', {
      workspace_id: workspaceId,
      limit,
      page,
      order: PAGE_ORDER,
    })
    this.reportShortPage(params, items.length, limit)
    return items.map((l) => transformTag(l, workspaceId))
  }

  /** `id` is the `{workspace_id}:{label_id}` that listTags returns. */
  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const scoped = splitScopedId(id)
    if (!scoped) {
      throw notSupported(
        `TAPD cannot read label "${id}": GET /label requires "workspace_id 是 integer 项目ID"; ` +
          'pass the id as "{workspace_id}:{label_id}"',
      )
    }
    const items = await this.client(credentials).getList<RawTapdLabel>('/label', 'LabelPool', {
      workspace_id: scoped.workspaceId,
      id: scoped.id,
    })
    const label = items.find((l) => l.id === scoped.id)
    if (!label) throw new Error(`TAPD label ${id} not found`)
    return transformTag(label, scoped.workspaceId)
  }

  // ── Workspaces ────────────────────────────────────────────────────────────
  //
  // We expose TAPD workspaces (=projects) at the canonical Workspace level
  // too, so callers can enumerate them without a companyId.

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const companyId = params['company_id'] ?? credentials.extra?.['companyId']
    if (!companyId) return pageLocally([], params)
    const items = await this.allCompanyWorkspaces<RawTapdWorkspace>(credentials, companyId)
    return pageLocally(items.map(transformWorkspace), params)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<{ Workspace?: RawTapdWorkspace }>(
      '/workspaces/info',
      { workspace_id: id },
    )
    const ws = (res as unknown as { Workspace?: RawTapdWorkspace })?.Workspace
    if (!ws) throw new Error(`TAPD workspace ${id} not found`)
    return transformWorkspace(ws)
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  //
  // GET https://api.tapd.cn/workspaces/users — "返回符合查询条件的所有项目成员
  // （无分页）", "一次返回所有符合条件的值 一次只能查一个项目". Parameters:
  // "workspace_id 是 integer 项目id 或者 公司id", "user 否 string 用户昵称
  // 支持多昵称过滤，用,分隔", "fields 否 string 需要查的字段值
  // user,user_id,role_id,name,email,real_join_time 可选，以,分隔".
  // Items are wrapped as { "UserWorkspace": {...} }. No paging, so the whole
  // member list is sliced locally.
  // (https://open.tapd.cn/document/api-doc/API%E6%96%87%E6%A1%A3/api_reference/workspace/users.html)

  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const items = await this.client(credentials).getList<RawTapdUser>(
      '/workspaces/users',
      'UserWorkspace',
      { workspace_id: workspaceId, fields: USER_FIELDS },
    )
    return pageLocally(
      items.map((u) => transformUser(u, workspaceId)),
      params,
    )
  }

  /** `id` is the `{workspace_id}:{nickname}` that listUsers returns. */
  async getUser(credentials: Credentials, id: string): Promise<User> {
    const scoped = splitScopedId(id)
    if (!scoped) {
      throw notSupported(
        `TAPD cannot read user "${id}": GET /workspaces/users requires ` +
          '"workspace_id 是 integer 项目id 或者 公司id"; pass the id as "{workspace_id}:{nickname}"',
      )
    }
    const items = await this.client(credentials).getList<RawTapdUser>(
      '/workspaces/users',
      'UserWorkspace',
      { workspace_id: scoped.workspaceId, user: scoped.id, fields: USER_FIELDS },
    )
    const user = items.find((u) => u.user === scoped.id)
    if (!user) throw new Error(`TAPD user ${id} not found`)
    return transformUser(user, scoped.workspaceId)
  }
}

export { DEFAULT_PAGE_SIZE }

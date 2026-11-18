/**
 * ONES adapter — projects vertical.
 *
 * ONES Project exposes an OpenAPI v2 REST surface (`/openapi/v2`) scoped to
 * the customer's own domain. The project-management surface maps to four
 * canonical resources:
 *   - projects  → GET /project/projects      (teamID required)
 *   - tasks     → GET /project/issues         (ONES "issues", teamID + projectID)
 *   - comments  → GET /project/issues/:id/comments
 *   - users     → GET /account/users/search   (teamID; getUser refuses, see below)
 *
 * ONES v2 OpenAPI does not expose a tags or workspaces resource, so
 * listTags/getTag/listWorkspaces/getWorkspace are not implemented — the
 * dispatcher returns 501 for them automatically.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: tag       — ONES OpenAPI v2 has no tags/labels resource or endpoint
 * Unavailable: workspace — ONES uses "team" as its org unit but exposes no /team or workspace endpoint in the project OpenAPI v2 surface
 *
 * ONES v2 OpenAPI does not document a webhook subscription API, so there
 * is no webhook handler.
 *
 * All list endpoints require `teamID` as a query parameter. The adapter
 * accepts `teamID` or `workspace_id` in QueryParams and forwards it.
 *
 * Timestamps are Unix epoch seconds; toIsoDatetime converts them.
 *
 * Pagination: projects and issues page by `limit` (default 50, "exceeding
 * 100 will be truncated to 100") and `cursor`, answered with
 * `pageInfo.endCursor` / `pageInfo.hasNextPage`. `pageByCursor` walks that
 * chain so caller page N is upstream page N at the caller's size; an explicit
 * `params.cursor` names the upstream page directly. The comments endpoint
 * documents neither parameter, so listComments pages the whole list locally.
 * listUsers pages `/account/users/search` the same way as projects and issues.
 *
 * Docs: https://docs.ones.com/developer/openapi/authorization
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  connectionOnesDomain,
  exchangeCode as onesExchange,
  refreshCredentials as onesRefresh,
} from './auth'
import { OnesClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'

import { transformProject, type RawOnesProject } from './transform/project'
import { transformTask, type RawOnesIssue } from './transform/task'
import { transformComment, type RawOnesComment } from './transform/comment'
import { transformUser, type RawOnesUser } from './transform/user'

export interface OnesAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /**
   * Deployment-wide ONES domain, e.g. https://acme.ones.com. Optional: the
   * domain is normally the customer's, collected at connect time
   * (`oauthFields`) and read back from `credentials.extra.domain`.
   */
  domain?: string
  scopes?: string[]
}

export class OnesAdapter implements ProjectsAdapter {
  readonly platform = 'ones'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private domain: string | undefined
  private scopes: string[]

  constructor(config: OnesAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.domain = config.domain
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  /**
   * OAuth and the OpenAPI both live on the customer's own ONES domain, which
   * deployment config cannot know. Asked for before the redirect.
   */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'domain',
        label: 'ONES domain',
        type: 'url',
        required: true,
        placeholder: 'https://acme.ones.com',
        helpText: 'The address you open ONES at. It must be reachable over https.',
      },
    ]
  }

  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    return buildAuthUrl(
      inputs?.['domain'] ?? this.domain,
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return onesExchange(this.domain, code, redirectUri, this.clientId, this.clientSecret)
  }

  /** Exchange on the customer's domain and remember it with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return onesExchange(
      inputs['domain'] ?? this.domain,
      code,
      redirectUri,
      this.clientId,
      this.clientSecret,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return onesRefresh(this.domain, credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): OnesClient {
    return new OnesClient(connectionOnesDomain(credentials, this.domain), credentials)
  }

  /** `teamID` is required by every ONES resource endpoint. */
  private teamId(params: QueryParams): string | undefined {
    const teamId = params['teamID'] ?? params['workspace_id']
    return teamId ? String(teamId) : undefined
  }

  /** The caller's limit, defaulted and clamped to the documented maximum. */
  private pageSize(params: QueryParams): number {
    const limit = params.limit
    const asked =
      typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
        ? Math.floor(limit)
        : DEFAULT_PAGE_SIZE
    return Math.min(asked, MAX_PAGE_SIZE)
  }

  /**
   * One caller page of a ONES `limit` / `cursor` list.
   *
   * An explicit `cursor` param names the upstream page directly. Otherwise
   * `page` is resolved by walking `pageInfo.endCursor` forward, one upstream
   * page per caller page, keyed per connection, path, filters and page size.
   */
  private async listPaged<T>(
    credentials: Credentials,
    path: string,
    filters: Record<string, unknown>,
    params: QueryParams,
  ): Promise<T[]> {
    const domain = connectionOnesDomain(credentials, this.domain)
    const client = new OnesClient(domain, credentials)
    const size = this.pageSize(params)
    const query = { ...filters, limit: size }
    const explicit = params['cursor']
    let result: { items: T[]; hasMore: boolean }
    if (typeof explicit === 'string' && explicit.length > 0) {
      const res = await client.getPage<T>(path, { ...query, cursor: explicit })
      result = { items: res.items, hasMore: res.pageInfo.hasNextPage === true }
    } else {
      const key = cursorPagerKey(connectionScope(domain, credentials), path, query)
      result = await pageByCursor<T>(key, params.page, async (cursor) => {
        const res = await client.getPage<T>(path, cursor ? { ...query, cursor } : query)
        const next = res.pageInfo.hasNextPage === true ? (res.pageInfo.endCursor ?? null) : null
        return { items: res.items, next }
      })
    }
    const limit = params.limit
    const clamped = typeof limit === 'number' && limit > size
    reportUpstreamPage(params, { hasMore: result.hasMore, ...(clamped ? { pageSize: size } : {}) })
    return result.items
  }

  // ── Projects ──────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const teamId = this.teamId(params)
    const rows = await this.listPaged<RawOnesProject>(
      credentials,
      '/project/projects',
      teamId ? { teamID: teamId } : {},
      params,
    )
    return rows.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const project = await this.client(credentials).getOne<RawOnesProject>(`/project/projects/${id}`)
    if (!project) throw new Error(`ONES project ${id} not found`)
    return transformProject(project)
  }

  // ── Tasks (ONES issues) ───────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const teamId = this.teamId(params)
    const rows = await this.listPaged<RawOnesIssue>(
      credentials,
      '/project/issues',
      { ...(teamId ? { teamID: teamId } : {}), projectID: projectId },
      params,
    )
    return rows.map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const issue = await this.client(credentials).getOne<RawOnesIssue>(`/project/issues/${id}`)
    if (!issue) throw new Error(`ONES issue ${id} not found`)
    return transformTask(issue)
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    // The comments endpoint documents only `teamID`: no limit, no cursor.
    // It returns the whole list, so it is paged here. The response still
    // carries `pageInfo`: if ONES ever says a next page exists, the list is
    // not whole, and slicing it would silently report a false end.
    const teamId = this.teamId(params)
    const res = await this.client(credentials).getPage<RawOnesComment>(
      `/project/issues/${taskId}/comments`,
      teamId ? { teamID: teamId } : {},
    )
    if (res.pageInfo.hasNextPage === true) {
      throw new Error(
        `ONES returned a partial comment list for issue ${taskId} (pageInfo.hasNextPage) ` +
          'but documents no paging input for it; refusing to serve it as complete',
      )
    }
    return pageLocally(res.items, params).map((c) => transformComment(c, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const comment = await this.client(credentials).getOne<RawOnesComment>(
      `/project/issue-comments/${id}`,
    )
    if (!comment) throw new Error(`ONES comment ${id} not found`)
    return transformComment(comment)
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  /**
   * The team's users, from GET /account/users/search: "teamID string required
   * The team ID limit integer Possible values: <= 100 Default value: 50 ...
   * cursor string The starting location of this request", answered with
   * `data.list` and `data.pageInfo` like the other cursor lists. The
   * canonical workspace id is the ONES team id. `keyword` is documented but
   * not sent: the adapter declares no search capability.
   *
   * Docs: https://docs.ones.com/developer/openapi/api/01-get-team-user-search-list/
   */
  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    if (!workspaceId) {
      throw Object.assign(
        new Error('ONES lists users per team: workspace_id (the ONES teamID) is required'),
        {
          statusCode: 400,
          code: 'MISSING_PARAM',
        },
      )
    }
    const rows = await this.listPaged<RawOnesUser>(
      credentials,
      '/account/users/search',
      { teamID: workspaceId },
      params,
    )
    return rows.map((u) => transformUser(u, workspaceId))
  }

  /**
   * ONES documents user lookup only as GET /account/users/batch, whose
   * `teamID` is required ("teamID string required The team ID ids string[]
   * required"). getUser receives only the user id, and the connection stores
   * no team id, so it refuses before sending anything.
   *
   * Docs: https://docs.ones.com/developer/openapi/api/01-get-user-list/
   */
  async getUser(_credentials: Credentials, _id: string): Promise<User> {
    throw Object.assign(
      new Error(
        'ONES cannot read a user by id alone: GET /account/users/batch requires "teamID string required The team ID", which this connection does not carry',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }
}

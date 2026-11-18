/**
 * Redmine adapter for the projects vertical.
 *
 * Redmine is a self-hosted open-source project management tool. Its REST API
 * lives at the root of the instance (e.g., `https://redmine.example.com`) and
 * is authenticated with an API key sent in the `X-Redmine-API-Key` header.
 * The instance URL is stored in `credentials.extra.host`.
 *
 * Supported canonical resources:
 *   - Projects  GET /projects.json, GET /projects/:id.json
 *   - Tasks     GET /issues.json?project_id=, GET /issues/:id.json
 *   - Comments  GET /issues/:id.json?include=journals (journals with notes)
 *
 * NOT implemented (Redmine does not have these concepts):
 *   - Tags       — no tag resource in Redmine core; tags are plugin-only
 *                  (maintainers closed REST API request as invalid, issue #36292)
 *   - Workspaces — no workspace concept; projects are the top-level grouping unit
 *   - Users (list) — GET /users.json requires admin; getUser by id is supported
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: tag       — Redmine core has no tag concept; tags are third-party
 *                          plugin territory only (redmine issue #36292 closed invalid)
 * Unavailable: workspace — Redmine has no workspace / organisation layer above projects
 *
 * Webhooks: Redmine core does not ship a signed-webhook mechanism. The
 * redmine_webhook plugin exists but has no canonical signature header, so
 * verifyWebhook / parseWebhookEvents are not implemented.
 */
import { pageLocally, pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { User } from '../../schema/user'

import { buildAuthUrl, exchangeCode as redmineExchange, refreshCredentials as redmineRefresh } from './auth'
import { RedmineClient } from './client'
import { API_KEY_HELP_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformProject, type RawRedmineProject } from './transform/project'
import { transformIssue, type RawRedmineIssue } from './transform/task'
import { transformJournal, type RawRedmineJournal } from './transform/comment'
import { transformUser, type RawRedmineUser } from './transform/user'

/** GET /projects.json */
interface ProjectsResponse {
  projects?: RawRedmineProject[]
  total_count?: number
  offset?: number
  limit?: number
}

/** GET /projects/:id.json */
interface ProjectResponse {
  project?: RawRedmineProject
}

/** GET /issues.json */
interface IssuesResponse {
  issues?: RawRedmineIssue[]
  total_count?: number
  offset?: number
  limit?: number
}

/** GET /issues/:id.json?include=journals */
interface IssueResponse {
  issue?: RawRedmineIssue & { journals?: RawRedmineJournal[] }
}

/** GET /users.json */
interface UsersResponse {
  users?: RawRedmineUser[]
  total_count?: number
  offset?: number
  limit?: number
}

/** GET /users/:id.json */
interface UserResponse {
  user?: RawRedmineUser
}

/** Connect Link form: API key + optional self-hosted URL */
const CONNECT_FORM = simpleApiKey({
  label: 'API key',
  helpText: `Generate an API key from your Redmine account (My Account → API access key). See ${API_KEY_HELP_URL}`,
})

export class RedmineAdapter implements ProjectsAdapter {
  readonly platform = 'redmine'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support — single API-key form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return redmineExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return redmineRefresh(credentials)
  }

  private client(credentials: Credentials): RedmineClient {
    return new RedmineClient(credentials)
  }

  /**
   * One caller page of an offset-paged collection. Redmine: "offset: the
   * offset of the first object to retrieve", "limit: ... (default is 25,
   * maximum is 100)", and every collection response carries `total_count`.
   * The caller limit is clamped to 100 (reported as `pageSize` when it is),
   * and the next signal is `offset + rows < total_count`, or a full page
   * when the instance omits the meta (`nometa`).
   */
  private async offsetPage<T extends { total_count?: number }>(
    credentials: Credentials,
    path: string,
    filters: Record<string, unknown>,
    params: QueryParams,
    rowsOf: (res: T) => unknown[] | undefined,
  ): Promise<T> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const size = Math.max(1, Math.min(Math.floor(limit), MAX_PAGE_SIZE))
    const offset = pageOffset(params, size)
    const res = await this.client(credentials).get<T>(path, { ...filters, limit: size, offset })
    const count = rowsOf(res)?.length ?? 0
    const total = typeof res.total_count === 'number' ? res.total_count : undefined
    reportUpstreamPage(params, {
      hasMore: total !== undefined ? offset + count < total : count >= size,
      ...(total !== undefined ? { totalCount: total } : {}),
      ...(size < limit ? { pageSize: size } : {}),
    })
    return res
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const res = await this.offsetPage<ProjectsResponse>(
      credentials,
      '/projects.json',
      {},
      params,
      (r) => r.projects,
    )
    return (res.projects ?? []).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<ProjectResponse>(`/projects/${id}.json`)
    if (!res.project) throw new Error(`Redmine project ${id} not found`)
    return transformProject(res.project)
  }

  // ── Tasks (issues) ───────────────────────────────────────────────────────

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const res = await this.offsetPage<IssuesResponse>(
      credentials,
      '/issues.json',
      { project_id: projectId },
      params,
      (r) => r.issues,
    )
    return (res.issues ?? []).map((issue) => transformIssue(issue, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<IssueResponse>(`/issues/${id}.json`)
    if (!res.issue) throw new Error(`Redmine issue ${id} not found`)
    return transformIssue(res.issue)
  }

  // ── Comments (journals) ──────────────────────────────────────────────────
  //
  // Redmine does not have a standalone comments endpoint. Journal entries are
  // embedded in the issue detail response when `include=journals` is passed.
  // Only journals with a non-empty `notes` field are surfaced as comments.
  // The issue returns every journal at once, so the list is paged locally.

  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    const res = await this.client(credentials).get<IssueResponse>(`/issues/${taskId}.json`, {
      include: 'journals',
    })
    const journals = res.issue?.journals ?? []
    const comments = journals
      .filter((j) => j.notes && j.notes.trim().length > 0)
      .map((j) => transformJournal(j, taskId))
    return pageLocally(comments, params)
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // Redmine does not have a standalone journal endpoint.
    // `id` is encoded as `{issueId}:{journalId}` (colon-separated).
    const [issueId, journalId] = id.split(':')
    if (!issueId || !journalId) {
      throw new Error(`Redmine comment id must be "{issueId}:{journalId}", got "${id}"`)
    }
    const res = await this.client(credentials).get<IssueResponse>(`/issues/${issueId}.json`, {
      include: 'journals',
    })
    const journal = (res.issue?.journals ?? []).find((j) => String(j.id) === journalId)
    if (!journal) throw new Error(`Redmine journal ${id} not found`)
    return transformJournal(journal, issueId)
  }

  // ── Users ────────────────────────────────────────────────────────────────
  //
  // GET /users.json requires Redmine admin privileges. listUsers returns an
  // empty array when called by a non-admin user rather than throwing.
  // getUser is supported for any authenticated user (own profile or admin).

  async listUsers(credentials: Credentials, _workspaceId: string, params: QueryParams): Promise<User[]> {
    try {
      const res = await this.offsetPage<UsersResponse>(
        credentials,
        '/users.json',
        {},
        params,
        (r) => r.users,
      )
      return (res.users ?? []).map(transformUser)
    } catch {
      // Non-admin users receive 403; return empty rather than surfacing an error.
      return []
    }
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<UserResponse>(`/users/${id}.json`)
    if (!res.user) throw new Error(`Redmine user ${id} not found`)
    return transformUser(res.user)
  }
}

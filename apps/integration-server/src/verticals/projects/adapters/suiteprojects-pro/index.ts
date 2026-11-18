/**
 * NetSuite SuiteProjects Pro (OpenAir) adapter for the projects vertical.
 *
 * Supported resources:
 *   - Projects     GET /projects/  + GET /projects/{id}
 *   - Tasks        GET /project-tasks/  + GET /project-tasks/{id}  (classification=T only)
 *   - Comments     GET /threaded-messages/  + GET /threaded-messages/{id}
 *   - Users        GET /users/  + GET /users/{id}
 *
 * Not supported (no REST API equivalent):
 *   - Tags      → no tag/label concept in the REST API
 *   - Workspaces → no workspace concept; org context is implicit per company account
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: tag       — No tag or label concept exists in the SuiteProjects Pro REST API.
 *                          The complete 2026.1 endpoint reference contains no /tags/ resource.
 * Unavailable: workspace — No workspace endpoint exists in the REST API. "Workspace" in
 *                          SuiteProjects Pro is a file-storage module for document attachments,
 *                          not a project-management organisational container; it is not exposed
 *                          as a listable REST resource (confirmed in official 2026.1 reference).
 *
 * Auth: OAuth 2.0 authorization_code flow. Client credentials sent as
 * HTTP Basic Auth. The company ID must be supplied at config time; it is
 * embedded in both the API base URL and the OAuth endpoints.
 *
 * Pagination: `limit` (1–1000) + `offset` query parameters, where "The `offset`
 * must be a positive number divisible by the page `limit`"; the response's
 * `meta.links` carries rel="next" except on the last page, and `meta.totalRows`
 * the collection size
 * (https://docs.oracle.com/en/cloud/saas/netsuite-suiteprojects-pro/online-help/article_160035263040.html).
 *
 * Docs: https://docs.oracle.com/en/cloud/saas/netsuite-suiteprojects-pro/online-help/article_160008162500.html
 */
import {
  pageOffset,
  reportUpstreamPage,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  exchangeCode as suiteExchangeCode,
  refreshCredentials as suiteRefreshCredentials,
} from './auth'
import {
  SuiteprojectsProClient,
  type SuiteProjectsListResponse,
  type SuiteProjectsSingleResponse,
} from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'

import { transformProject, type RawSuiteProjectsProject } from './transform/project'
import { transformTask, type RawSuiteProjectsTask } from './transform/task'
import { transformComment, type RawSuiteProjectsMessage } from './transform/comment'
import { transformUser, type RawSuiteProjectsUser } from './transform/user'

export interface SuiteprojectsProAdapterConfig {
  /**
   * Deployment-wide OpenAir company identifier (subdomain used in API/OAuth
   * URLs). Optional: the account is normally the customer's, collected at
   * connect time (`oauthFields`) and read back from `credentials.extra.companyId`.
   */
  companyId?: string
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class SuiteprojectsProAdapter implements ProjectsAdapter {
  readonly platform = 'suiteprojects-pro'
  readonly version = '0.1.0'

  private companyId: string | undefined
  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: SuiteprojectsProAdapterConfig) {
    this.companyId = config.companyId
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  /**
   * OAuth and REST both live on `{company-id}.app.netsuitesuiteprojectspro.com`,
   * and the company ID is the customer's. Asked for before the redirect.
   */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'companyId',
        label: 'Company ID',
        type: 'text',
        required: true,
        placeholder: 'acme',
        helpText: 'Your SuiteProjects Pro account ID — acme for acme.app.netsuitesuiteprojectspro.com.',
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
      inputs?.['companyId'] ?? this.companyId,
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return suiteExchangeCode(
      code,
      redirectUri,
      this.clientId,
      this.clientSecret,
      this.companyId,
    )
  }

  /** Exchange on the customer's account and remember the company ID with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return suiteExchangeCode(
      code,
      redirectUri,
      this.clientId,
      this.clientSecret,
      inputs['companyId'] ?? this.companyId,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return suiteRefreshCredentials(credentials, this.clientId, this.clientSecret, this.companyId)
  }

  private client(credentials: Credentials): SuiteprojectsProClient {
    return new SuiteprojectsProClient(credentials, this.companyId)
  }

  /** Unchanged from HEAD; only listComments still uses it (see its note). */
  private pageParams(params: QueryParams): Record<string, unknown> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const offset = params['cursor'] ? Number(params['cursor']) : 0
    return { limit, offset }
  }

  /**
   * One caller page of an offset-paged collection: `limit` is the caller's,
   * clamped to the documented 1–1000, and `offset` is (page − 1) × that size,
   * which keeps it divisible by `limit` as the API requires. The end comes
   * from `meta.links`, which omits rel="next" on the last page.
   */
  private async listPaged<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    query: Record<string, unknown> = {},
  ): Promise<T[]> {
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const limit = Math.min(Math.max(Math.floor(asked), 1), MAX_PAGE_SIZE)
    const res = await this.client(credentials).get<SuiteProjectsListResponse<T>>(path, {
      limit,
      offset: pageOffset(params, limit),
      ...query,
    })
    const meta = res.meta
    const rows = res.data ?? []
    reportUpstreamPage(params, {
      hasMore: meta?.links ? meta.links.some((l) => l.rel === 'next') : rows.length >= limit,
      ...(typeof meta?.totalRows === 'number' ? { totalCount: meta.totalRows } : {}),
      ...(limit < asked ? { pageSize: limit } : {}),
    })
    return rows
  }

  // ── Projects ────────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const rows = await this.listPaged<RawSuiteProjectsProject>(credentials, '/projects/', params)
    return rows.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<
      SuiteProjectsSingleResponse<RawSuiteProjectsProject>
    >(`/projects/${id}`)
    if (!res.data) throw new Error(`SuiteProjects Pro project ${id} not found`)
    return transformProject(res.data)
  }

  // ── Tasks (project-tasks, classification=T) ─────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const rows = await this.listPaged<RawSuiteProjectsTask>(credentials, '/project-tasks/', params, {
      // Filter by project; use OA query syntax
      q: `projectId IS '${projectId}'`,
    })
    return rows.map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<
      SuiteProjectsSingleResponse<RawSuiteProjectsTask>
    >(`/project-tasks/${id}`)
    if (!res.data) throw new Error(`SuiteProjects Pro project-task ${id} not found`)
    return transformTask(res.data)
  }

  // ── Comments (threaded-messages, project-level discussion) ──────────────────

  async listComments(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    // REBUILD BACKLOG: `/threaded-messages/` is not a documented path. The
    // docs list messages at GET /threaded-discussions/{id}/messages with an id
    // like `project-247` (article_4155518519, article_4155518531). Paging is left
    // as it was until the endpoint is rebuilt, because a paging fix against an
    // undocumented path would test nothing.
    const res = await this.client(credentials).get<
      SuiteProjectsListResponse<RawSuiteProjectsMessage>
    >('/threaded-messages/', {
      ...this.pageParams(params),
      // Filter to messages attached to this project
      q: `recordId IS '${projectId}' AND tableName IS 'project'`,
    })
    return (res.data ?? []).map((m) => transformComment(m, projectId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const res = await this.client(credentials).get<
      SuiteProjectsSingleResponse<RawSuiteProjectsMessage>
    >(`/threaded-messages/${id}`)
    if (!res.data) throw new Error(`SuiteProjects Pro threaded-message ${id} not found`)
    return transformComment(res.data)
  }

  // ── Users ────────────────────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const rows = await this.listPaged<RawSuiteProjectsUser>(credentials, '/users/', params)
    return rows.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<
      SuiteProjectsSingleResponse<RawSuiteProjectsUser>
    >(`/users/${id}`)
    if (!res.data) throw new Error(`SuiteProjects Pro user ${id} not found`)
    return transformUser(res.data)
  }
}

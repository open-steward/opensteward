/**
 * Procore adapter — construction project management (projects vertical).
 *
 * Canonical mapping:
 *   Workspace ← Company   (GET /companies)
 *   Project   ← Project    (GET /projects?company_id=…)
 *   Task      ← RFI        (GET /projects/{project_id}/rfis)
 *   User      ← Company user (GET /companies/{company_id}/users)
 *
 *   Comment   ← RFI reply  (GET /projects/{project_id}/rfis/{rfi_id}/replies)
 *
 * Procore scopes resources beneath a Company, so list calls require a
 * `company_id` — supplied via `params.workspace_id`. RFI show and user show
 * both require a parent id that the canonical single-id getters don't carry,
 * so `getTask` / `getUser` are intentionally omitted (they auto-501).
 *
 * Every call except List Companies must also carry the `Procore-Company-Id`
 * header (https://developers.procore.com/documentation/tutorial-mpz). Where
 * the call names its company (`listUsers`, `listProjects`) that id is sent;
 * the project-scoped reads (`listTasks`, `getProject`, `listComments`,
 * `getComment`) take it from the connection's `credentials.extra.companyId`
 * and refuse with a 501 before sending anything when it is absent.
 *
 * Comments are modelled as RFI replies. Procore webhook deliveries are unsigned thin
 * notifications (resource_name/resource_id/event_type) with no documented
 * signature, so no webhook verification is implemented.
 *
 * Pagination: `page` (1-based) + `per_page`, with the next page surfaced via
 * the `Link` response header.
 *
 * Docs: https://developers.procore.com/documentation/introduction
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: tag — Procore has no first-class tags/labels concept in its REST API
//              for the projects vertical. Resource Planning tags are a UI-only feature
//              with no documented API endpoint.

import { reportUpstreamPage, type Credentials, type QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  exchangeCode as procoreExchange,
  refreshCredentials as procoreRefresh,
} from './auth'
import { ProcoreClient, type PagedResult } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PER_PAGE } from './constants'

import { transformProject, type RawProcoreProject } from './transform/project'
import { transformTask, type RawProcoreRfi } from './transform/task'
import { transformWorkspace, type RawProcoreCompany } from './transform/workspace'
import { transformUser, type RawProcoreUser } from './transform/user'
import { transformComment, type RawProcoreRfiReply } from './transform/comment'

export interface ProcoreAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class ProcoreAdapter implements ProjectsAdapter {
  readonly platform = 'procore'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ProcoreAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return procoreExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return procoreRefresh(credentials, this.clientId, this.clientSecret, this.redirectUri)
  }

  private client(credentials: Credentials, companyId?: string): ProcoreClient {
    return new ProcoreClient(credentials, companyId)
  }

  /**
   * The connection's Procore company, sent as the `Procore-Company-Id` header
   * that every project-scoped call needs: "Each call your application makes to
   * the Procore API must contain a request header that includes the
   * `Procore-Company-Id` field." (https://developers.procore.com/documentation/tutorial-mpz).
   * The OAuth token response carries no company, so it can only come from the
   * connection's config (`credentials.extra.companyId`); without it the call is
   * refused before anything is sent.
   */
  private connectionCompanyId(credentials: Credentials, what: string): string {
    const companyId = credentials.extra?.['companyId']
    if (typeof companyId === 'string' && companyId !== '') return companyId
    if (typeof companyId === 'number' && Number.isInteger(companyId)) return String(companyId)
    throw Object.assign(
      new Error(
        `Procore cannot ${what} without the connection's company id (credentials.extra.companyId): ` +
          '"Each call your application makes to the Procore API must contain a request header ' +
          'that includes the Procore-Company-Id field."',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  /**
   * One caller page of a Procore list: `page` (1-based) and `per_page` are
   * sent as asked, `per_page` clamped to the documented 2,000 recommendation,
   * and the end reported from the `Link` header, whose rel="next" Procore
   * omits on the last page (https://developers.procore.com/documentation/pagination).
   */
  private async listPaged<T>(
    credentials: Credentials,
    companyId: string | undefined,
    path: string,
    params: QueryParams,
    query: Record<string, unknown> = {},
  ): Promise<T[]> {
    const page = typeof params.page === 'number' && params.page >= 1 ? Math.floor(params.page) : 1
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const perPage = Math.min(Math.max(Math.floor(asked), 1), MAX_PER_PAGE)
    const res: PagedResult<T> = await this.client(credentials, companyId).list<T>(path, {
      ...query,
      page,
      per_page: perPage,
    })
    reportUpstreamPage(params, {
      hasMore: res.nextPage !== undefined,
      ...(res.total !== undefined ? { totalCount: res.total } : {}),
      ...(perPage < asked ? { pageSize: perPage } : {}),
    })
    return res.data
  }

  private requireCompanyId(params: QueryParams): string {
    const companyId = params['workspace_id']
    if (companyId == null || companyId === '') {
      throw new Error('Procore requires a company id; pass it as params.workspace_id')
    }
    return String(companyId)
  }

  // ── Workspaces (Companies) ───────────────────────────────────────────────
  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    // List Companies is exempt from the Procore-Company-Id header.
    const rows = await this.listPaged<RawProcoreCompany>(
      credentials,
      undefined,
      '/companies',
      params,
    )
    return rows.map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    // Procore v1.0 exposes companies only as a collection, so resolve by
    // scanning the list. per_page is maxed to keep this to a single page.
    const res = await this.client(credentials).list<RawProcoreCompany>('/companies', {
      page: 1,
      per_page: DEFAULT_PAGE_SIZE,
    })
    const match = res.data.find((c) => String(c.id) === String(id))
    if (!match) throw new Error(`Procore company ${id} not found`)
    return transformWorkspace(match)
  }

  // ── Projects ─────────────────────────────────────────────────────────────
  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const companyId = this.requireCompanyId(params)
    const rows = await this.listPaged<RawProcoreProject>(
      credentials,
      companyId,
      '/projects',
      params,
      { company_id: companyId },
    )
    return rows.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    // Show Project documents `company_id` as a required query parameter as
    // well as the Procore-Company-Id header.
    const companyId = this.connectionCompanyId(credentials, 'show a project')
    const raw = await this.client(credentials, companyId).get<RawProcoreProject>(
      `/projects/${id}`,
      { company_id: companyId },
    )
    if (!raw || raw.id == null) throw new Error(`Procore project ${id} not found`)
    return transformProject(raw)
  }

  // ── Tasks (RFIs) ─────────────────────────────────────────────────────────
  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const companyId = this.connectionCompanyId(credentials, 'list RFIs')
    const rows = await this.listPaged<RawProcoreRfi>(
      credentials,
      companyId,
      `/projects/${projectId}/rfis`,
      params,
    )
    return rows.map((rfi) => transformTask(rfi, projectId))
  }

  // ── Users (Company directory) ────────────────────────────────────────────
  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    // The company named in the path is the company the call is made into.
    const rows = await this.listPaged<RawProcoreUser>(
      credentials,
      workspaceId,
      `/companies/${workspaceId}/users`,
      params,
    )
    return rows.map((u) => transformUser(u, workspaceId))
  }

  // ── Comments (RFI replies) ────────────────────────────────────────────────
  //
  // List RFI Replies: GET /rest/v1.0/projects/{project_id}/rfis/{rfi_id}/replies
  // documents the page / per_page query parameters and the Link / Total /
  // Per-Page response headers, like every other list here
  // (https://developers.procore.com/api/v1/resource_groups/resource/replies?version=rest_v1.0).
  // taskId is the RFI id; the project id, which the path requires and the RFI
  // id alone does not identify, is passed as params.project_id.

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const projectId = params['project_id']
    if (typeof projectId !== 'string' && typeof projectId !== 'number') {
      throw Object.assign(
        new Error(
          "Procore cannot list RFI replies without the RFI's project: " +
            'GET /rest/v1.0/projects/{project_id}/rfis/{rfi_id}/replies requires project_id ' +
            '(pass params.project_id)',
        ),
        { statusCode: 501, code: 'NOT_SUPPORTED' },
      )
    }
    const companyId = this.connectionCompanyId(credentials, 'list RFI replies')
    const project = String(projectId)
    const rows = await this.listPaged<RawProcoreRfiReply>(
      credentials,
      companyId,
      `/projects/${project}/rfis/${taskId}/replies`,
      params,
    )
    return rows.map((r) => transformComment(r, taskId, project))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // Show RFI Reply: GET /rest/v1.0/projects/{project_id}/rfis/{rfi_id}/replies/{id}.
    // listComments mints ids as projectId:rfiId:replyId so they read back here.
    const parts = id.split(':')
    if (parts.length !== 3 || parts.some((p) => p === '')) {
      throw new Error('Procore getComment expects id as "projectId:rfiId:replyId"')
    }
    const [projectId, rfiId, replyId] = parts as [string, string, string]
    const companyId = this.connectionCompanyId(credentials, 'show an RFI reply')
    const raw = await this.client(credentials, companyId).get<RawProcoreRfiReply>(
      `/projects/${projectId}/rfis/${rfiId}/replies/${replyId}`,
    )
    return transformComment(raw, rfiId, projectId)
  }
}

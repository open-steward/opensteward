/**
 * ProductPlan adapter for the projects vertical.
 *
 * ProductPlan is a roadmapping platform. The canonical mapping is:
 *   Roadmap  → Project
 *   Bar      → Task  (bars are the items on roadmap lanes)
 *   Comment  → Comment  (on roadmaps or bars)
 *   User     → User
 *   Idea tag → Tag  (GET /discovery/ideas/tags, `{ tags: string[] }`)
 *
 * Auth: API key (Bearer token), generated in
 *   https://app.productplan.com/integrations/custom
 *
 * Base URL: https://app.productplan.com/api/v2
 * Pagination: ?page=N&page_size=N  (default 200, max 500); `paging` in the response
 * Response envelope: bare array OR { results: [...] }
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: workspace — ProductPlan has no workspace/organisation API;
//              the platform is account-scoped with no tenant hierarchy exposed
//              via the v2 REST API (no workspace endpoint appears in the
//              official endpoint list, and requests to one return 404).
import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { User } from '../../schema/user'
import {
  getAuthUrlUnsupported,
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
} from './auth'
import { ProductplanClient, unwrapList } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformProject, type RawProductplanRoadmap } from './transform/project'
import { transformTask, type RawProductplanBar } from './transform/task'
import { transformComment, type RawProductplanComment } from './transform/comment'
import { transformTag, type RawProductplanTag } from './transform/tag'
import { transformUser, type RawProductplanUser } from './transform/user'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ProductplanAdapterConfig {
  // No OAuth config needed — API key auth only.
}

export class ProductplanAdapter implements ProjectsAdapter {
  readonly platform = 'productplan'
  readonly version = '0.1.0'

  constructor(_config?: ProductplanAdapterConfig) {}

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return adapterExchangeCredentials(fields)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('productplan uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire.
    return credentials
  }

  private client(credentials: Credentials): ProductplanClient {
    return new ProductplanClient(credentials)
  }

  /**
   * The page-number query ProductPlan documents on its list endpoints:
   * `page` "Indicates which page number to retrieve (based on a given page
   * size)" and `page_size` "The amount of items to return with each page
   * (default: 200, max: 500)"
   * (https://productplan.readme.io/reference/get_api-v2-roadmaps.md).
   */
  private pageParams(params: QueryParams): { page: number; page_size: number } {
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const size = Math.min(Math.max(1, Math.floor(asked)), MAX_PAGE_SIZE)
    const page = params.page !== undefined && params.page >= 1 ? Math.floor(params.page) : 1
    return { page, page_size: size }
  }

  /**
   * Report the `paging` object each list response carries: `record_count`
   * ("The total number of elements existing in the collection (pre-paging)"),
   * `page_count` ("The total number of pages") and `current_page`. A limit
   * clamped to the maximum is reported as the size actually asked for.
   */
  private reportPaging(params: QueryParams, res: unknown, sent: { page_size: number }): void {
    const paging =
      res && typeof res === 'object' && !Array.isArray(res)
        ? ((res as Record<string, unknown>)['paging'] as
            { record_count?: number; page_count?: number; current_page?: number } | undefined)
        : undefined
    const pageSize =
      params.limit !== undefined && sent.page_size < params.limit
        ? { pageSize: sent.page_size }
        : {}
    if (
      !paging ||
      typeof paging.current_page !== 'number' ||
      typeof paging.page_count !== 'number'
    ) {
      reportUpstreamPage(params, pageSize)
      return
    }
    reportUpstreamPage(params, {
      ...pageSize,
      hasMore: paging.current_page < paging.page_count,
      currentPage: paging.current_page,
      totalPages: paging.page_count,
      ...(typeof paging.record_count === 'number' ? { totalCount: paging.record_count } : {}),
    })
  }

  // ── Projects (Roadmaps) ──────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const query = this.pageParams(params)
    const res = await this.client(credentials).get<unknown>('/roadmaps', query)
    this.reportPaging(params, res, query)
    return unwrapList<RawProductplanRoadmap>(res).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const raw = await this.client(credentials).get<RawProductplanRoadmap>(`/roadmaps/${id}`)
    return transformProject(raw)
  }

  // ── Tasks (Bars) ─────────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const query = this.pageParams(params)
    const res = await this.client(credentials).get<unknown>(`/roadmaps/${projectId}/bars`, query)
    this.reportPaging(params, res, query)
    return unwrapList<RawProductplanBar>(res).map((b) => transformTask(b, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const raw = await this.client(credentials).get<RawProductplanBar>(`/bars/${id}`)
    return transformTask(raw)
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    // Fetch comments scoped to the bar (task).
    const query = this.pageParams(params)
    const res = await this.client(credentials).get<unknown>(`/bars/${taskId}/comments`, query)
    this.reportPaging(params, res, query)
    return unwrapList<RawProductplanComment>(res).map((c) => transformComment(c, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // ProductPlan does not expose a single-comment endpoint; fall through
    // to the parent roadmap comments and find by id.
    throw new Error(`productplan: getComment(${id}) — single-comment fetch not supported`)
  }

  // ── Tags (Idea tags) ─────────────────────────────────────────────────────

  /**
   * GET /discovery/ideas/tags documents no query parameters and the 200 body
   * `{"tags": string[]}` ("required": ["tags"])
   * (https://productplan.readme.io/reference/get_api-v2-discovery-ideas-tags.md),
   * so every tag arrives in one response and is paged locally.
   */
  private async allTags(credentials: Credentials): Promise<Tag[]> {
    const res = await this.client(credentials).get<{ tags: RawProductplanTag[] }>(
      '/discovery/ideas/tags',
    )
    return [...new Set(res.tags)].map(transformTag)
  }

  async listTags(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    // Account-wide; ProductPlan has no workspace, so workspaceId is unused.
    return pageLocally(await this.allTags(credentials), params)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    // No single-tag endpoint: a tag is its string, found in the full list.
    const found = (await this.allTags(credentials)).find((t) => t.id === id)
    if (!found)
      throw Object.assign(new Error(`productplan: tag ${id} not found`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    return found
  }

  // ── Users ────────────────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const query = this.pageParams(params)
    const res = await this.client(credentials).get<unknown>('/users', query)
    this.reportPaging(params, res, query)
    return unwrapList<RawProductplanUser>(res).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawProductplanUser>(`/users/${id}`)
    return transformUser(raw)
  }
}

/**
 * SmartTask adapter for the projects vertical.
 *
 * Auth: API key (Bearer token) via credentialFields().
 * Base URL: https://ext-v2.smarttask.io/v1.0
 *
 * Supported resources:
 *   - Workspaces → SmartTask organizations   (GET  /organization/list)
 *   - Projects   → SmartTask projects         (POST /project/list/{org_id}/0)
 *   - Tasks      → SmartTask tasks            (POST /task/create-task body-search; GET by id)
 *   - Comments   → SmartTask activities       (POST /record-activity/activities/{org_id}/{record_id})
 *   - Users      → SmartTask org members      (POST /organization-user/filter-users/{org_id})
 *
 * Webhooks: subscribe/unsubscribe endpoints exist but signature verification
 * is undocumented; verifyWebhook is not implemented.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: tag — SmartTask REST API exposes no tag/label endpoints;
 *              dev.smarttask.io lists all endpoint categories and none cover
 *              tags, and task/project responses contain no tag fields.
 */
import { connectionScope, cursorPagerKey, pageByRows, pageLocally } from '@opensteward/shared'
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { SmarttaskClient } from './client'
import { DEFAULT_PAGE_SIZE, USERS_MAX_PAGE_SIZE } from './constants'

import { transformProject, type RawSmarttaskProject } from './transform/project'
import { transformTask, type RawSmarttaskTask } from './transform/task'
import { transformComment, type RawSmarttaskActivity } from './transform/comment'
import { transformWorkspace, type RawSmarttaskOrganization } from './transform/workspace'
import { transformUser, type RawSmarttaskUser } from './transform/user'

export interface SmarttaskAdapterConfig {
  // No OAuth client credentials needed for API key auth; config is a no-op.
  [key: string]: unknown
}

interface ActivityListResponse {
  list?: RawSmarttaskActivity[]
  limit_reached?: boolean
}

export class SmarttaskAdapter implements ProjectsAdapter {
  readonly platform = 'smarttask'
  readonly version = '0.1.0'

  constructor(_config?: SmarttaskAdapterConfig) {}

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
    throw new Error('smarttask uses API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire.
    return credentials
  }

  private client(credentials: Credentials): SmarttaskClient {
    return new SmarttaskClient(credentials)
  }

  // ── Workspaces (organizations) ────────────────────────────────────────────

  /**
   * Every organization the user belongs to. GET /organization/list documents
   * no paging parameter: "This endpoint allows you to get all organizations a
   * user is associated with."
   * (https://dev.smarttask.io/endpoints/organization/fetch-organizations)
   */
  private async allWorkspaces(credentials: Credentials): Promise<Workspace[]> {
    const res = await this.client(credentials).get<RawSmarttaskOrganization[]>(
      '/organization/list',
    )
    return (Array.isArray(res) ? res : []).map(transformWorkspace)
  }

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    return pageLocally(await this.allWorkspaces(credentials), params)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const all = await this.allWorkspaces(credentials)
    const found = all.find((w) => w.id === id)
    if (!found) throw new Error(`SmartTask organization ${id} not found`)
    return found
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const organizationId = String(params['workspace_id'] ?? '')
    if (!organizationId) return []
    const pageNo = params['cursor'] ? Number(params['cursor']) : 1
    const listSize = params.limit ?? DEFAULT_PAGE_SIZE
    // archive_flag=0 → active projects
    const res = await this.client(credentials).post<RawSmarttaskProject[]>(
      `/project/list/${organizationId}/0`,
      [],
      { page_no: pageNo, list_size: listSize },
    )
    const items: RawSmarttaskProject[] = Array.isArray(res) ? res : []
    return items.map((p) => {
      p._organizationId = organizationId
      return transformProject(p, organizationId)
    })
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    // SmartTask list endpoint returns minimal fields; we find by ProjectId.
    const orgs = await this.listWorkspaces(credentials, {})
    for (const org of orgs) {
      const projects = await this.listProjects(credentials, {
        workspace_id: org.id,
        limit: 100,
      })
      const found = projects.find((p) => p.id === id)
      if (found) return found
    }
    throw new Error(`SmartTask project ${id} not found`)
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const organizationId = String(params['workspace_id'] ?? '')
    if (!organizationId) return []
    const pageNo = params['cursor'] ? Number(params['cursor']) : 1
    const listSize = params.limit ?? DEFAULT_PAGE_SIZE
    // SmartTask filter-tasks endpoint: POST /task/filter-tasks/{organization_id}/{project_id}
    const res = await this.client(credentials).post<RawSmarttaskTask[]>(
      `/task/filter-tasks/${organizationId}/${projectId}`,
      [],
      { page_no: pageNo, list_size: listSize },
    )
    const items: RawSmarttaskTask[] = Array.isArray(res) ? res : []
    return items.map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // SmartTask does not document a dedicated get-by-id endpoint for tasks;
    // use the complete-task status endpoint pattern: GET /task/get-task/{org}/{record_id}
    // Fall back gracefully — fetch and find.
    const orgs = await this.listWorkspaces(credentials, {})
    for (const org of orgs) {
      const projects = await this.listProjects(credentials, {
        workspace_id: org.id,
        limit: 100,
      })
      for (const project of projects) {
        const tasks = await this.listTasks(credentials, project.id, {
          workspace_id: org.id,
          limit: 100,
        })
        const found = tasks.find((t) => t.id === id)
        if (found) return found
      }
    }
    throw new Error(`SmartTask task ${id} not found`)
  }

  // ── Comments (record activities) ─────────────────────────────────────────

  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    const organizationId = String(params['workspace_id'] ?? '')
    if (!organizationId) return []
    const listSize = params.limit ?? DEFAULT_PAGE_SIZE
    const queryParams: Record<string, unknown> = { list_size: listSize }
    if (params['cursor']) queryParams['before_id'] = String(params['cursor'])
    const res = await this.client(credentials).post<ActivityListResponse>(
      `/record-activity/activities/${organizationId}/${taskId}`,
      ['comment'],
      queryParams,
    )
    const list = res?.list ?? []
    return list.map((a) => transformComment(a, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // No single-comment lookup endpoint documented; return a stub.
    throw new Error(`SmartTask does not support single comment lookup by id (${id})`)
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  /**
   * Filter Users pages by `page_no` ("Page Number") and `list_size` ("Cannot
   * be greater than 100"), https://dev.smarttask.io/endpoints/user/search-users.
   * The response is a bare array with no total or next link, so a short page
   * is the end. Upstream pages are a fixed 100 rows and `pageByRows` cuts the
   * caller's `page`/`limit` out of them, peeking past a full page so
   * `hasMore` is exact at any limit, including one above 100.
   */
  async listUsers(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<User[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(
      connectionScope(`smarttask:${workspaceId}`, credentials),
      'organization-users',
      { list_size: USERS_MAX_PAGE_SIZE },
    )
    const { items } = await pageByRows<User, number>(
      key,
      params,
      async (pageNo) => {
        const page = pageNo ?? 1
        const res = await client.post<RawSmarttaskUser[]>(
          `/organization-user/filter-users/${workspaceId}`,
          [],
          { page_no: page, list_size: USERS_MAX_PAGE_SIZE },
        )
        const rows: RawSmarttaskUser[] = Array.isArray(res) ? res : []
        return {
          items: rows.map((u) => transformUser(u, workspaceId)),
          next: rows.length >= USERS_MAX_PAGE_SIZE ? page + 1 : undefined,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const orgs = await this.listWorkspaces(credentials, {})
    for (const org of orgs) {
      const users = await this.listUsers(credentials, org.id, { limit: 100 })
      const found = users.find((u) => u.id === id)
      if (found) return found
    }
    throw new Error(`SmartTask user ${id} not found`)
  }
}

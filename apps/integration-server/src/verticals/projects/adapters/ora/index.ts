/**
 * Ora adapter for the projects vertical.
 *
 * Auth: API key (OAuth2 client credentials) — user supplies a client_id and
 * client_secret from their Ora Organization application settings. These are
 * exchanged for a short-lived Bearer access token at the token endpoint.
 *
 * Supported resources:
 *   - listProjects / getProject    (GET /projects)
 *   - listTasks / getTask          (GET /projects/:id/tasks)
 *   - listTags / getTag            (GET /projects/:id/labels)
 *   - listUsers / getUser          (GET /projects/:id/members)
 *
 * Refused (501 NOT_SUPPORTED, before any request): comments and workspaces.
 * See NO_COMMENTS and NO_WORKSPACES below for the spec evidence.
 *
 * Pagination (Ora's Swagger spec, https://api.ora.pm/swagger.json): the
 * project-scoped lists (tasks, labels, members) take `offset`
 * "Number of items already displayed" and `limit` "Number of items per
 * page". No total, next link or maximum is documented, so a page shorter than
 * `limit` is the end. GET /projects documents no query parameters and returns
 * the whole collection, so listProjects pages it locally.
 *
 * Webhooks: Ora does not document a webhook signature-verification scheme;
 * verifyWebhook / parseWebhookEvents are not implemented.
 *
 * Docs: https://ora.pm/docs/getting-started-with-ora-public-api
 */
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  refreshStoredCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { OraClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformProject, type RawOraProject } from './transform/project'
import { transformTask, type RawOraTask } from './transform/task'
import { transformTag, type RawOraLabel } from './transform/tag'
import { transformUser, type RawOraUser } from './transform/user'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface OraAdapterConfig {}

/**
 * Why comments are refused. Ora's only comments list, GET
 * /projects/{project_id}/tasks/{task_id}/comments, has a response model that
 * documents no comment id and no author, both required canonical fields.
 */
const NO_COMMENTS =
  'the only documented list is GET /projects/{project_id}/tasks/{task_id}/comments ("Get comments"), and its response model "Task Comment" documents only comment ("Content of the comment."), created_at, updated_at and public: no comment id and no author. /tasks/{task_id}/comments is not in the spec (https://api.ora.pm/swagger.json)'

/** Why a single comment is refused: there is no documented GET for one. */
const NO_COMMENT_GET =
  'the spec documents no GET for a single comment: /projects/{project_id}/tasks/{task_id}/comments/{comment_id} has only PUT and DELETE, and /comments/{id} is not in the spec (https://api.ora.pm/swagger.json)'

/**
 * Why workspaces are refused. GET /organizations exists, but its response
 * model documents no id, the one field a workspace cannot do without.
 */
const NO_WORKSPACES =
  'GET /organizations ("Get user organizations") documents a response model "Organization" with owner_id, name, title, description, created_at, updated_at, org_picture, org_type, premium_plan and quantity, and no id field; /user/current is not in the spec (https://api.ora.pm/swagger.json)'

/** Why a single workspace is refused: there is no documented GET for one. */
const NO_WORKSPACE_GET =
  'the spec documents no GET for a single organization: /organizations/{organization_id} has only PUT and DELETE (https://api.ora.pm/swagger.json)'

function refuse(what: string, reason: string): never {
  throw Object.assign(new Error(`Ora cannot ${what}: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

/**
 * Ora list responses may be bare arrays or wrapped in a key such as
 * `{ projects: [...] }`, `{ tasks: [...] }` etc.  We normalise both.
 */
type OraListResponse<T> = T[] | { [key: string]: T[] | unknown }

function unwrapList<T>(res: OraListResponse<T>, key?: string): T[] {
  if (Array.isArray(res)) return res
  if (key && Array.isArray((res as Record<string, unknown>)[key])) {
    return (res as Record<string, unknown>)[key] as T[]
  }
  // Fall back: look for first array-valued property
  for (const v of Object.values(res as Record<string, unknown>)) {
    if (Array.isArray(v)) return v as T[]
  }
  return []
}

type OraSingleResponse<T> = T | { [key: string]: T | unknown }

function unwrapSingle<T>(res: OraSingleResponse<T>, key?: string): T | undefined {
  if (res == null) return undefined
  if (key && typeof res === 'object' && !Array.isArray(res)) {
    const wrapped = (res as Record<string, unknown>)[key]
    if (wrapped != null) return wrapped as T
  }
  if (typeof res === 'object' && 'id' in (res as object)) return res as T
  return res as T
}

export class OraAdapter implements ProjectsAdapter {
  readonly platform = 'ora'
  readonly version = '0.1.0'

  constructor(_config?: OraAdapterConfig) {}

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
    throw new Error('Ora uses API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshStoredCredentials(credentials)
  }

  private client(credentials: Credentials): OraClient {
    return new OraClient(credentials)
  }

  /** The caller's limit; Ora documents no maximum to clamp it to. */
  private pageSize(params: QueryParams): number {
    const limit = params.limit
    return typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
      ? Math.floor(limit)
      : DEFAULT_PAGE_SIZE
  }

  /**
   * One caller page of an `offset` / `limit` list: `offset` is the rows of
   * the pages before it at this size. A short page is the documented end.
   */
  private async listOffset<T>(
    credentials: Credentials,
    path: string,
    key: string,
    params: QueryParams,
  ): Promise<T[]> {
    const size = this.pageSize(params)
    const res = await this.client(credentials).get<OraListResponse<T>>(path, {
      offset: pageOffset(params, size),
      limit: size,
    })
    const rows = unwrapList<T>(res, key)
    reportUpstreamPage(params, { hasMore: rows.length >= size })
    return rows
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    // GET /projects documents no query parameters: every project, sliced here.
    const res = await this.client(credentials).get<OraListResponse<RawOraProject>>('/projects')
    return pageLocally(unwrapList<RawOraProject>(res, 'projects'), params).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<OraSingleResponse<RawOraProject>>(
      `/projects/${id}`,
    )
    const item = unwrapSingle<RawOraProject>(res, 'project')
    if (!item) throw new Error(`Ora project ${id} not found`)
    return transformProject(item)
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const rows = await this.listOffset<RawOraTask>(
      credentials,
      `/projects/${projectId}/tasks`,
      'tasks',
      params,
    )
    return rows.map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<OraSingleResponse<RawOraTask>>(`/tasks/${id}`)
    const item = unwrapSingle<RawOraTask>(res, 'task')
    if (!item) throw new Error(`Ora task ${id} not found`)
    return transformTask(item)
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  async listComments(
    _credentials: Credentials,
    _taskId: string,
    _params: QueryParams,
  ): Promise<Comment[]> {
    return refuse('list comments', NO_COMMENTS)
  }

  async getComment(_credentials: Credentials, _id: string): Promise<Comment> {
    return refuse('read a comment', NO_COMMENT_GET)
  }

  // ── Tags (Labels) ──────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, projectId: string, params: QueryParams): Promise<Tag[]> {
    const rows = await this.listOffset<RawOraLabel>(
      credentials,
      `/projects/${projectId}/labels`,
      'labels',
      params,
    )
    return rows.map((l) => transformTag(l, projectId))
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const res = await this.client(credentials).get<OraSingleResponse<RawOraLabel>>(`/labels/${id}`)
    const item = unwrapSingle<RawOraLabel>(res, 'label')
    if (!item) throw new Error(`Ora label ${id} not found`)
    return transformTag(item)
  }

  // ── Workspaces (Organisations) ─────────────────────────────────────────────

  async listWorkspaces(_credentials: Credentials, _params: QueryParams): Promise<Workspace[]> {
    return refuse('list workspaces', NO_WORKSPACES)
  }

  async getWorkspace(_credentials: Credentials, _id: string): Promise<Workspace> {
    return refuse('read a workspace', NO_WORKSPACE_GET)
  }

  // ── Users (Members) ────────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const rows = await this.listOffset<RawOraUser>(
      credentials,
      `/projects/${projectId}/members`,
      'members',
      params,
    )
    return rows.map((u) => transformUser(u, projectId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<OraSingleResponse<RawOraUser>>(`/users/${id}`)
    const item = unwrapSingle<RawOraUser>(res, 'user')
    if (!item) throw new Error(`Ora user ${id} not found`)
    return transformUser(item)
  }
}

/**
 * Odoo Project adapter, on the shared Odoo client (@opensteward/shared
 * adapter/odoo): JSON-2 on Odoo 19+, External RPC (/jsonrpc execute_kw) on
 * 14–18, as the connection chooses. Project is part of Odoo Community, so this
 * works on every edition; on Odoo Online the external API needs a Custom plan
 * ("Access to data via the external API is only available on Custom Odoo
 * pricing plans", external_api.html).
 *
 * Docs: https://www.odoo.com/documentation/19.0/developer/reference/external_api.html
 *   "Post a JSON object at the /json/2/<model>/<method> URL."
 *
 * Models (fields quoted in each transform, from github.com/odoo/odoo 14.0–19.0):
 *   - Projects    project.project  (addons/project)
 *   - Tasks       project.task     (addons/project), one project's tasks by project_id
 *   - Comments    mail.message     (addons/mail), message_type 'comment' on a task
 *   - Tags        project.tags     (addons/project), one set per database
 *   - Workspaces  res.company      (odoo/addons/base)
 *   - Users       res.users        (odoo/addons/base), internal users (share = False)
 * Task stages (project.task.type) are read through the task's `stage_id`
 * ([id, name]) into metadata; the stage is customer-defined, so the canonical
 * status comes from the task's `state` (17.0+) or its closing stage and
 * kanban_state (14.0–16.0).
 *
 * Every list is one `search_read` page: "offset and limit parameters are
 * available to only retrieve a subset of all matched records" (19.0
 * external_rpc_api, Pagination), in id order, with search_count for the total.
 * `updated_after` narrows every list to `write_date >=` the watermark.
 *
 * Read-only: the projects vertical has no write methods.
 */
import {
  ODOO_CREDENTIAL_FORM,
  OdooClient,
  odooDatetime,
  pageOffset,
  reportUpstreamPage,
  type Credentials,
  type OdooDomain,
  type QueryParams,
} from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import { DEFAULT_LIMIT } from './constants'
import { PROJECT_FIELDS, transformProject, type RawOdooProject } from './transform/project'
import { TASK_FIELDS, transformTask, type RawOdooTask } from './transform/task'
import { MESSAGE_FIELDS, transformComment, type RawOdooMessage } from './transform/comment'
import { TAG_FIELDS, transformTag, type RawOdooTag } from './transform/tag'
import { COMPANY_FIELDS, transformWorkspace, type RawOdooCompany } from './transform/workspace'
import { USER_FIELDS, transformUser, type RawOdooUser } from './transform/user'

/** The models a comment may belong to here: a task (listed) or a project (by id only). */
const COMMENT_MODELS = new Set(['project.task', 'project.project'])

/**
 * `share`: "External user with limited access, created only for the purpose
 * of sharing data" (res_users.py). Task assignees are internal users: the
 * user_ids domain is "[('share', '=', False), ('active', '=', True)]"
 * (project_task.py, 19.0).
 */
const INTERNAL_USERS: OdooDomain = [['share', '=', false]]

export interface OdooProjectAdapterConfig {
  /** Unused: the Odoo URL is per connection, in `credentials.extra.baseUrl` (the shared Odoo form). */
  instanceUrl?: string
}

function notFound(what: string, id: string): Error {
  return Object.assign(new Error(`Odoo: ${what} ${id} not found`), {
    statusCode: 404,
    code: 'NOT_FOUND',
  })
}

/** Odoo record ids are integers; anything else names no record. */
function recordId(what: string, id: string): number {
  if (!/^[1-9]\d*$/.test(id)) throw notFound(what, id)
  return Number(id)
}

function pageLimit(params: QueryParams): number {
  const limit = params.limit ?? DEFAULT_LIMIT
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 1) {
    throw Object.assign(new Error(`Odoo: limit must be a number ≥ 1 (got ${String(limit)})`), {
      statusCode: 400,
      code: 'VALIDATION',
    })
  }
  return Math.floor(limit)
}

/**
 * `updated_after` as `write_date >= …`. Every model read here has the
 * log-access column write_date ("Last Updated On", project_task.py 17.0+).
 * Odoo keeps it to the second in UTC and odooDatetime drops milliseconds, so
 * `>=` keeps a row written in the watermark's own second: a superset, never a
 * gap. Same filter as the accounting Odoo adapter.
 */
function withUpdatedAfter(domain: OdooDomain, params: QueryParams): OdooDomain {
  const after = params.updatedAfter
  if (!(after instanceof Date) || Number.isNaN(after.getTime())) return domain
  return [...domain, ['write_date', '>=', odooDatetime(after)]]
}

// project.task `priority` keys per (server, database), from fields_get. The
// selection is part of the database schema, not of the user, so the key is
// the database. Bounded like the shared client's caches.
const prioritySelections = new Map<string, readonly string[] | null>()
const PRIORITY_CACHE_MAX = 1000

/** Test hook. */
export function _resetOdooProjectCaches(): void {
  prioritySelections.clear()
}

export class OdooProjectAdapter implements ProjectsAdapter {
  credentialFields = ODOO_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = ODOO_CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'odoo-project'
  readonly version = '0.1.0'

  constructor(_config: OdooProjectAdapterConfig = {}) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    // Odoo authenticates with an API key; there is no OAuth2 redirect.
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('OdooProjectAdapter: OAuth2 not supported. Use API key auth.')
  }

  /** An API key is sent as is on every call; there is nothing to refresh. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private client(credentials: Credentials): OdooClient {
    return new OdooClient(credentials)
  }

  private async pageOf<T>(
    credentials: Credentials,
    params: QueryParams,
    model: string,
    domain: OdooDomain,
    fields: string[],
  ): Promise<T[]> {
    const limit = pageLimit(params)
    const offset = pageOffset(params, limit)
    const page = await this.client(credentials).searchPage<T>(model, {
      domain: withUpdatedAfter(domain, params),
      fields,
      offset,
      limit,
    })
    reportUpstreamPage(params, {
      hasMore: page.hasMore,
      ...(page.totalCount !== undefined ? { totalCount: page.totalCount } : {}),
    })
    return page.rows
  }

  /** One record by id with `read` (no default active filter), or a 404. */
  private async one<T>(
    credentials: Credentials,
    what: string,
    model: string,
    id: string,
    fields: string[],
  ): Promise<T> {
    const rows = await this.client(credentials).read<T>(model, [recordId(what, id)], fields)
    const row = rows[0]
    if (!row) throw notFound(what, id)
    return row
  }

  /**
   * The keys of project.task `priority` on this server, in order, from
   * `fields_get` with the `selection` attribute ("fields_get() can be used to
   * inspect a model's fields", 19.0 external_rpc_api). Its meaning differs by
   * version — '1' is "High" on 16.0–18.0 and "Medium priority" on 19.0 — and a
   * JSON-2 or RPC connection alone does not tell 18 from 19. Asked only when a
   * row carries a priority; null when the server reports none.
   */
  private async prioritySelection(
    credentials: Credentials,
    rows: RawOdooTask[],
  ): Promise<readonly string[] | undefined> {
    if (!rows.some((r) => typeof r.priority === 'string')) return undefined
    const client = this.client(credentials)
    const { baseUrl, database } = client.connection
    const key = `${baseUrl}\u0000${database ?? ''}`
    if (!prioritySelections.has(key)) {
      const attributes = ['selection']
      const out = await client.call('project.task', 'fields_get', { attributes }, [], {
        attributes,
      })
      const selection = (out as Record<string, { selection?: unknown }> | null)?.['priority']
        ?.selection
      const keys = Array.isArray(selection)
        ? selection.map((s) => (Array.isArray(s) ? s[0] : undefined))
        : undefined
      if (prioritySelections.size >= PRIORITY_CACHE_MAX) prioritySelections.clear()
      prioritySelections.set(
        key,
        keys && keys.every((k): k is string => typeof k === 'string') ? keys : null,
      )
    }
    return prioritySelections.get(key) ?? undefined
  }

  private async tasks(credentials: Credentials, rows: RawOdooTask[]): Promise<Task[]> {
    const selection = await this.prioritySelection(credentials, rows)
    return rows.map((r) => transformTask(r, selection))
  }

  // ── Projects (project.project) ─────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const rows = await this.pageOf<RawOdooProject>(
      credentials,
      params,
      'project.project',
      [],
      PROJECT_FIELDS,
    )
    return rows.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    return transformProject(
      await this.one<RawOdooProject>(credentials, 'project', 'project.project', id, PROJECT_FIELDS),
    )
  }

  // ── Tasks (project.task) ───────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const project = recordId('project', projectId)
    const rows = await this.pageOf<RawOdooTask>(
      credentials,
      params,
      'project.task',
      [['project_id', '=', project]],
      TASK_FIELDS,
    )
    return this.tasks(credentials, rows)
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const row = await this.one<RawOdooTask>(credentials, 'task', 'project.task', id, TASK_FIELDS)
    const [task] = await this.tasks(credentials, [row])
    return task!
  }

  // ── Comments (mail.message) ────────────────────────────────────────────────

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const task = recordId('task', taskId)
    const rows = await this.pageOf<RawOdooMessage>(
      credentials,
      params,
      'mail.message',
      [
        ['model', '=', 'project.task'],
        ['res_id', '=', task],
        ['message_type', '=', 'comment'],
      ],
      MESSAGE_FIELDS,
    )
    return rows.map(transformComment)
  }

  /** A comment on a task or project; any other message (a CRM note, a notification) is a 404. */
  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const row = await this.one<RawOdooMessage>(
      credentials,
      'comment',
      'mail.message',
      id,
      MESSAGE_FIELDS,
    )
    if (
      row.message_type !== 'comment' ||
      typeof row.model !== 'string' ||
      !COMMENT_MODELS.has(row.model)
    ) {
      throw notFound('comment', id)
    }
    return transformComment(row)
  }

  // ── Tags (project.tags) ────────────────────────────────────────────────────

  /**
   * Tags are one set per database, with no company or project of their own
   * (project_tags.py), so `workspaceId` does not narrow the list: every
   * workspace sees every tag.
   */
  async listTags(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    const rows = await this.pageOf<RawOdooTag>(credentials, params, 'project.tags', [], TAG_FIELDS)
    return rows.map(transformTag)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    return transformTag(
      await this.one<RawOdooTag>(credentials, 'tag', 'project.tags', id, TAG_FIELDS),
    )
  }

  // ── Workspaces (res.company) ───────────────────────────────────────────────

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const rows = await this.pageOf<RawOdooCompany>(
      credentials,
      params,
      'res.company',
      [],
      COMPANY_FIELDS,
    )
    return rows.map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    return transformWorkspace(
      await this.one<RawOdooCompany>(credentials, 'workspace', 'res.company', id, COMPANY_FIELDS),
    )
  }

  // ── Users (res.users) ──────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const company = recordId('workspace', workspaceId)
    const rows = await this.pageOf<RawOdooUser>(
      credentials,
      params,
      'res.users',
      [...INTERNAL_USERS, ['company_ids', 'in', [company]]],
      USER_FIELDS,
    )
    return rows.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    return transformUser(
      await this.one<RawOdooUser>(credentials, 'user', 'res.users', id, USER_FIELDS),
    )
  }
}

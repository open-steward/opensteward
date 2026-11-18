/**
 * Ruddr adapter for the projects vertical.
 *
 * Ruddr is a project management and resource planning platform. Its REST API
 * is authenticated with a long-lived API key passed as a Bearer token.
 * Base URL: https://www.ruddr.io/api/workspace
 *
 * Supported canonical resources:
 *   - Projects   GET /projects, GET /projects/{id}
 *   - Tags       GET /task-tags (getTag refuses: no documented workspace id)
 *   - Users      GET /members, GET /members/{id}
 *   - Tasks      GET /tasks?projectId=, GET /tasks/{id}
 *
 * Workspaces refuse with 501: the published OpenAPI
 * (https://docs.ruddr.io/openapi.json) has no workspace resource.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: comment — Ruddr has no comment or note model in its REST API
 *                        (confirmed: 68 resource categories listed at docs.ruddr.io/llms.txt,
 *                         none is "comments")
 *
 * Webhooks are not documented by Ruddr; verifyWebhook / parseWebhookEvents
 * are not implemented.
 *
 * Docs: https://docs.ruddr.io/
 */
import {
  simpleApiKey,
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Tag } from '../../schema/tag'
import type { Task } from '../../schema/task'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  exchangeCode as ruddrExchange,
  refreshCredentials as ruddrRefresh,
} from './auth'
import { RuddrClient } from './client'
import { API_KEY_HELP_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformProject, type RawRuddrProject } from './transform/project'
import { transformTag, type RawRuddrTag } from './transform/tag'
import { transformTask, type RawRuddrProjectTask } from './transform/task'
import { transformUser, type RawRuddrMember } from './transform/user'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** Ruddr list response envelope */
interface ListResponse<T> {
  results?: T[]
  hasMore?: boolean
}

/** Connect Link form: single API key field */
const CONNECT_FORM = simpleApiKey({
  label: 'API key',
  helpText: `Generate an API key in your Ruddr workspace (Settings → API Keys). See ${API_KEY_HELP_URL}`,
})

export class RuddrAdapter implements ProjectsAdapter {
  readonly platform = 'ruddr'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return ruddrExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return ruddrRefresh(credentials)
  }

  private client(credentials: Credentials): RuddrClient {
    return new RuddrClient(credentials)
  }

  /**
   * One caller page of a Ruddr list endpoint, walking the documented cursor:
   * "use the `id` of the last item in each response as the `startingAfter`
   * cursor for the next request. Continue until `hasMore` is `false`."
   * (https://docs.ruddr.io/guides/pagination). `limit` is 1–100.
   *
   * An explicit `params.cursor` is still honoured as a raw `startingAfter`.
   * `filters` are documented query filters of `path`; they are sent on every
   * request and are part of the pager key.
   */
  private async pageList<T extends { id: string }>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    filters: Record<string, string> = {},
  ): Promise<T[]> {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const client = this.client(credentials)
    if (params['cursor']) {
      const res = await client.get<ListResponse<T>>(path, {
        limit,
        ...filters,
        startingAfter: String(params['cursor']),
      })
      reportUpstreamPage(params, { hasMore: res.hasMore === true, pageSize: limit })
      return res.results ?? []
    }
    const key = cursorPagerKey(connectionScope('ruddr', credentials), path, { limit, ...filters })
    const page = await pageByCursor<T, string>(key, params.page, async (after) => {
      const res = await client.get<ListResponse<T>>(path, {
        limit,
        ...filters,
        ...(after ? { startingAfter: after } : {}),
      })
      const items = res.results ?? []
      const last = items[items.length - 1]
      return { items, next: res.hasMore === true && last?.id ? last.id : null }
    })
    reportUpstreamPage(params, { hasMore: page.hasMore, pageSize: limit })
    return page.items
  }

  // ── Workspace ──────────────────────────────────────────────────────────────
  //
  // The published OpenAPI (https://docs.ruddr.io/openapi.json, 158 paths) has
  // no workspace resource and no `GET /`: the only workspace-named paths are
  // /workspace-roles. Both methods refuse before sending anything.

  async listWorkspaces(_credentials: Credentials, _params: QueryParams): Promise<Workspace[]> {
    throw notSupported(
      'Ruddr cannot list workspaces: its API documents no workspace resource (the only workspace paths are /workspace-roles)',
    )
  }

  async getWorkspace(_credentials: Credentials, _id: string): Promise<Workspace> {
    throw notSupported(
      'Ruddr cannot read a workspace: its API documents no workspace resource (the only workspace paths are /workspace-roles)',
    )
  }

  // ── Projects ────────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const rows = await this.pageList<RawRuddrProject>(credentials, '/projects', params)
    return rows.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const raw = await this.client(credentials).get<RawRuddrProject>(`/projects/${id}`)
    if (!raw?.id) throw new Error(`Ruddr project ${id} not found`)
    return transformProject(raw)
  }

  // ── Tags (task tags) ────────────────────────────────────────────────────────
  //
  // The only canonical reference to a Tag is Task.tagIds, and Ruddr documents
  // a task's tags as task tags: POST /tasks `tagIds` is "A list of task tag
  // IDs (`uuid`) to associate with this task." So tags are served from
  // "GET /task-tags" (StartingAfter, EndingBefore, Limit, name), returning
  // `{ results: TaskTag[], hasMore }` (https://docs.ruddr.io/openapi.json,
  // operationId list-task-tags). Ruddr documents no workspace id, so a tag's
  // canonical workspaceId is the one the caller scoped the list to.

  async listTags(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    const rows = await this.pageList<RawRuddrTag>(credentials, '/task-tags', params)
    return rows.map((t) => transformTag(t, workspaceId))
  }

  async getTag(_credentials: Credentials, _id: string): Promise<Tag> {
    // GET /task-tags/{id} is documented, but its TaskTag carries only
    // id, name, isActive and createdAt: nothing supplies the canonical Tag's
    // required workspaceId, and this call has no caller-scoped one.
    throw notSupported(
      'Ruddr cannot read a single tag: its TaskTag documents no workspace id, which the canonical Tag requires; list tags with a workspace_id instead',
    )
  }

  // ── Users (members) ────────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const rows = await this.pageList<RawRuddrMember>(credentials, '/members', params)
    return rows.map((m) => transformUser(m))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawRuddrMember>(`/members/${id}`)
    if (!raw?.id) throw new Error(`Ruddr member ${id} not found`)
    return transformUser(raw)
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────
  //
  // "GET /tasks" with a `projectId` filter ("A project ID (`uuid`) used to
  // filter objects for a specific project.") and `modifiedAtOnAfter` ("This will
  // match timestamps on and after (`>=`) the value specified."), and
  // "GET /tasks/{id}" (https://docs.ruddr.io/api-reference/tasks/list-tasks.md).

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const filters: Record<string, string> = { projectId }
    if (params.updatedAfter) filters['modifiedAtOnAfter'] = params.updatedAfter.toISOString()
    const rows = await this.pageList<RawRuddrProjectTask>(credentials, '/tasks', params, filters)
    return rows.map(transformTask)
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const raw = await this.client(credentials).get<RawRuddrProjectTask>(`/tasks/${id}`)
    if (!raw?.id) throw new Error(`Ruddr task ${id} not found`)
    return transformTask(raw)
  }
}

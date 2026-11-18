/**
 * Buildertrend adapter — construction project management → canonical projects.
 *
 * Resource mapping:
 *   - Job             → Project   (top-level container)
 *   - Schedule item   → Task      (dated work item; phases → parentId)
 *   - To-Do           → Task      (checklist item with due date + completion)
 *   - Comment         → Comment   (text note on a to-do)
 *   - Builder account → Workspace (the tenant)
 *   - User            → User      (internal users, subs, customers)
 *
 * No documented webhook signature scheme exists, so webhook
 * verification/parsing is not implemented.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: tag — Buildertrend has no tag concept in its partner REST API;
 *              the platform UI has simple labels for filtering but no /tags
 *              endpoint is exposed via the v1 API.
 */
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import { buildAuthUrl, exchangeCode as buildertrendExchange, refreshCredentials as buildertrendRefresh } from './auth'
import { BuildertrendClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'

import { transformProject, type RawBuildertrendJob } from './transform/project'
import { transformTask, type RawBuildertrendTask } from './transform/task'
import { transformComment, type RawBuildertrendComment } from './transform/comment'
import { transformWorkspace, type RawBuildertrendBuilder } from './transform/workspace'
import { transformUser, type RawBuildertrendUser } from './transform/user'

export interface BuildertrendAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

// Buildertrend list endpoints return `{ data: [...], meta: {...} }`; single
// GETs return `{ data: {...} }`. Some endpoints return a bare array/object —
// `unwrapList` / `unwrapItem` tolerate both.
interface ListResponse<T> {
  data?: T[]
  meta?: { totalCount?: number; pageCount?: number }
}

interface GetResponse<T> {
  data?: T
}

function unwrapList<T>(res: ListResponse<T> | T[] | undefined): T[] {
  if (Array.isArray(res)) return res
  return res?.data ?? []
}

function unwrapItem<T>(res: GetResponse<T> | T | undefined): T | undefined {
  if (res == null) return undefined
  if (typeof res === 'object' && 'data' in (res as Record<string, unknown>)) {
    return (res as GetResponse<T>).data
  }
  return res as T
}

export class BuildertrendAdapter implements ProjectsAdapter {
  readonly platform = 'buildertrend'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: BuildertrendAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return buildertrendExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return buildertrendRefresh(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): BuildertrendClient {
    return new BuildertrendClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      page: params.page ?? (params['cursor'] ? Number(params['cursor']) : 1),
    }
  }

  // ── Projects (Jobs) ────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const res = await this.client(credentials).get<ListResponse<RawBuildertrendJob>>('/jobs', {
      ...this.listParams(params),
    })
    return unwrapList(res).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<GetResponse<RawBuildertrendJob>>(`/jobs/${id}`)
    const job = unwrapItem(res)
    if (!job) throw new Error(`Buildertrend job ${id} not found`)
    return transformProject(job)
  }

  // ── Tasks (Schedule items + To-Dos) ──────────────────────────────────────────

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const client = this.client(credentials)
    const query = { ...this.listParams(params), jobId: projectId }
    const [schedules, todos] = await Promise.all([
      client.get<ListResponse<RawBuildertrendTask>>(`/jobs/${projectId}/schedule-items`, query),
      client.get<ListResponse<RawBuildertrendTask>>(`/jobs/${projectId}/todos`, query),
    ])
    return [
      ...unwrapList(schedules).map((t) => transformTask(t, 'schedule', projectId)),
      ...unwrapList(todos).map((t) => transformTask(t, 'todo', projectId)),
    ]
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<GetResponse<RawBuildertrendTask>>(`/todos/${id}`)
    const task = unwrapItem(res)
    if (!task) throw new Error(`Buildertrend to-do ${id} not found`)
    return transformTask(task, 'todo')
  }

  // ── Comments ─────────────────────────────────────────────────────────────────

  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    const res = await this.client(credentials).get<ListResponse<RawBuildertrendComment>>(
      `/todos/${taskId}/comments`,
      { ...this.listParams(params) },
    )
    return unwrapList(res).map((c) => transformComment(c, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const res = await this.client(credentials).get<GetResponse<RawBuildertrendComment>>(
      `/comments/${id}`,
    )
    const comment = unwrapItem(res)
    if (!comment) throw new Error(`Buildertrend comment ${id} not found`)
    return transformComment(comment)
  }

  // ── Workspaces (Builder accounts) ────────────────────────────────────────────

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const res = await this.client(credentials).get<ListResponse<RawBuildertrendBuilder>>('/builders', {
      ...this.listParams(params),
    })
    return unwrapList(res).map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<GetResponse<RawBuildertrendBuilder>>(
      `/builders/${id}`,
    )
    const builder = unwrapItem(res)
    if (!builder) throw new Error(`Buildertrend builder ${id} not found`)
    return transformWorkspace(builder)
  }

  // ── Users ────────────────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<ListResponse<RawBuildertrendUser>>(
      `/builders/${workspaceId}/users`,
      { ...this.listParams(params) },
    )
    return unwrapList(res).map((u) => transformUser(u, workspaceId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<GetResponse<RawBuildertrendUser>>(`/users/${id}`)
    const user = unwrapItem(res)
    if (!user) throw new Error(`Buildertrend user ${id} not found`)
    return transformUser(user)
  }
}

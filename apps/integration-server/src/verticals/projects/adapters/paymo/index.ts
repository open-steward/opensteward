/**
 * Paymo adapter for the projects vertical.
 *
 * Paymo exposes a single-tenant REST API at `https://app.paymoapp.com/api`,
 * authenticated with a long-lived API key via HTTP Basic auth (the key is the
 * username; the password is ignored). There is no OAuth2 authorization-code
 * flow, so the key is collected through the Connect Link form (`simpleApiKey`).
 *
 * Supported canonical resources:
 *   - Projects   GET /projects, GET /projects/{id}
 *   - Tasks      GET /tasks?where=project_id={pid}, GET /tasks/{id}
 *   - Comments   GET /threads?where=task_id={tid}&include=comments (list),
 *                GET /comments/{id} (single)
 *   - Users      GET /users, GET /users/{id}
 *   - Workspaces GET /company (derived: single company → single workspace record)
 *
 * List responses are unpaginated objects keyed by the plural resource name
 * (`{ "projects": [...] }`); server-side filtering uses the `where` parameter.
 * The docs (https://github.com/paymo-org/api) document no paging parameter on
 * any listing, so every list method receives the whole collection and pages
 * it locally with `pageLocally` (exact `hasMore` and total).
 * The company endpoint uses a singular envelope: `{ "company": { ... } }`.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: tag — Paymo has no tag or label concept; no /tags endpoint
 *              exists and no tag fields appear on projects or tasks.
 */
import { pageLocally, simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { User } from '../../schema/user'
import type { Workspace } from '../../schema/workspace'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as paymoExchange,
  refreshCredentials as paymoRefresh,
} from './auth'
import { PaymoClient } from './client'
import { API_KEY_HELP_URL, DEFAULT_PAGE_SIZE } from './constants'
import { verifyPaymoWebhook, parsePaymoWebhookEvents } from './webhook'

import { transformProject, type RawPaymoProject } from './transform/project'
import { transformTask, type RawPaymoTask } from './transform/task'
import { transformComment, type RawPaymoComment } from './transform/comment'
import { transformUser, type RawPaymoUser } from './transform/user'
import { transformWorkspace, type RawPaymoCompany } from './transform/workspace'

/** Collection responses wrap the array under the plural resource name. */
interface ProjectsResponse {
  projects?: RawPaymoProject[]
}
interface TasksResponse {
  tasks?: RawPaymoTask[]
}
interface CommentsResponse {
  comments?: RawPaymoComment[]
}
interface UsersResponse {
  users?: RawPaymoUser[]
}
/** The company endpoint uses a singular envelope: { "company": { ... } }. */
interface CompanyResponse {
  company?: RawPaymoCompany
}

/** A thread carries its comments inline when fetched with `include=comments`. */
interface RawPaymoThread {
  id?: number
  task_id?: number
  comments?: RawPaymoComment[]
  [key: string]: unknown
}
interface ThreadsResponse {
  threads?: RawPaymoThread[]
}

/** Connect Link form: a single API key. */
const CONNECT_FORM = simpleApiKey({
  label: 'API key',
  helpText: `Generate an API key from your Paymo account. See ${API_KEY_HELP_URL}`,
})

export class PaymoAdapter implements ProjectsAdapter {
  readonly platform = 'paymo'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return paymoExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return paymoRefresh(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPaymoWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePaymoWebhookEvents(payload)
  }

  private client(credentials: Credentials): PaymoClient {
    return new PaymoClient(credentials)
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const res = await this.client(credentials).get<ProjectsResponse>('/projects')
    return pageLocally((res.projects ?? []).map(transformProject), params)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<ProjectsResponse>(`/projects/${id}`)
    const single = res.projects?.[0]
    if (!single) throw new Error(`Paymo project ${id} not found`)
    return transformProject(single)
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const res = await this.client(credentials).get<TasksResponse>('/tasks', {
      where: `project_id=${projectId}`,
    })
    return pageLocally(
      (res.tasks ?? []).map((t) => transformTask(t, projectId)),
      params,
    )
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<TasksResponse>(`/tasks/${id}`)
    const single = res.tasks?.[0]
    if (!single) throw new Error(`Paymo task ${id} not found`)
    return transformTask(single)
  }

  // ── Comments ─────────────────────────────────────────────────────────────
  //
  // Paymo comments hang off a thread. The per-task comment list is obtained by
  // resolving the task's thread with `?where=task_id={tid}&include=comments`,
  // which returns the thread(s) with their comments nested inline.

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const res = await this.client(credentials).get<ThreadsResponse>('/threads', {
      where: `task_id=${taskId}`,
      include: 'comments',
    })
    const threads = res.threads ?? []
    return pageLocally(
      threads.flatMap((thread) => (thread.comments ?? []).map((c) => transformComment(c, taskId))),
      params,
    )
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const res = await this.client(credentials).get<CommentsResponse>(`/comments/${id}`)
    const single = res.comments?.[0]
    if (!single) throw new Error(`Paymo comment ${id} not found`)
    return transformComment(single)
  }

  // ── Users ────────────────────────────────────────────────────────────────
  //
  // `workspaceId` is accepted for interface compatibility but unused — Paymo
  // has no workspace concept; users belong to the single company account.

  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const res = await this.client(credentials).get<UsersResponse>('/users')
    return pageLocally((res.users ?? []).map(transformUser), params)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<UsersResponse>(`/users/${id}`)
    const single = res.users?.[0]
    if (!single) throw new Error(`Paymo user ${id} not found`)
    return transformUser(single)
  }

  // ── Workspaces ────────────────────────────────────────────────────────────
  //
  // Paymo is single-tenant: one account = one company. The `/company` endpoint
  // returns a singular envelope `{ "company": { ... } }`. We derive a single
  // Workspace record from that object so the canonical resource resolves.
  // The `workspaceId` param on `getWorkspace` is ignored because there can only
  // ever be one.

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const res = await this.client(credentials).get<CompanyResponse>('/company')
    return pageLocally(res.company ? [transformWorkspace(res.company)] : [], params)
  }

  async getWorkspace(credentials: Credentials, _id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<CompanyResponse>('/company')
    if (!res.company) throw new Error('Paymo company not found')
    return transformWorkspace(res.company)
  }
}

export { DEFAULT_PAGE_SIZE }

/**
 * ActiveCollab adapter for the projects vertical.
 *
 * ActiveCollab Cloud exposes a per-account REST API at
 * `https://app.activecollab.com/{accountId}/api/v1`, authenticated with a
 * long-lived token in the `X-Angie-AuthApiToken` header. There is no OAuth2
 * authorization-code flow, so credentials are collected through the Connect
 * Link form (a `customForm` with `accountId` + `apiKey`).
 *
 * Supported canonical resources:
 *   - Projects   GET /projects, GET /projects/{id}
 *   - Tasks      GET /projects/{pid}/tasks, GET /projects/{pid}/tasks/{id}
 *                (canonical task id is the composite `{projectId}:{taskId}`)
 *   - Comments   from the single-task wrapper's `comments` array;
 *                single comment via GET /comments/{id}
 *   - Tags       GET /labels (account-global labels)
 *   - Users      GET /users/all
 *
 * Workspaces are intentionally NOT implemented: ActiveCollab has no
 * workspace concept (an account is a single workspace), so those methods
 * are left off and auto-respond 501.
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: workspace — ActiveCollab has no workspace concept; an account is a single workspace with no listable workspace objects
import { customForm } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { User } from '../../schema/user'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as activecollabExchange, refreshCredentials as activecollabRefresh } from './auth'
import { ActivecollabClient } from './client'
import { DEFAULT_PAGE_SIZE, TOKEN_HELP_URL } from './constants'
import { verifyActivecollabWebhook, parseActivecollabWebhookEvents } from './webhook'

import { transformProject, type RawActivecollabProject } from './transform/project'
import { transformTask, type RawActivecollabTask } from './transform/task'
import { transformComment, type RawActivecollabComment } from './transform/comment'
import { transformTag, type RawActivecollabLabel } from './transform/tag'
import { transformUser, type RawActivecollabUser } from './transform/user'

/** Single-resource responses wrap the object under `single` plus related data. */
interface SingleProjectResponse {
  single?: RawActivecollabProject
}
interface SingleTaskResponse {
  single?: RawActivecollabTask
  comments?: RawActivecollabComment[]
}
interface SingleCommentResponse {
  single?: RawActivecollabComment
}

/**
 * GET /projects/{id}/tasks returns a compound object, NOT a bare array.
 * Top-level keys: tasks, task_lists, label_ids, project, completed_tasks_count.
 */
interface TaskListResponse {
  tasks?: RawActivecollabTask[]
  task_lists?: unknown[]
  label_ids?: unknown[]
  completed_tasks_count?: number
}

/**
 * Split a canonical composite id (`{projectId}:{resourceId}`) into its parts.
 * Tasks/subtasks encode their project id this way because ActiveCollab's
 * single-resource GETs are path-scoped under a project. A bare id (no colon)
 * is returned as `resourceId` with an empty `projectId`.
 */
function splitScopedId(id: string): { projectId: string; resourceId: string } {
  const idx = id.indexOf(':')
  if (idx === -1) return { projectId: '', resourceId: id }
  return { projectId: id.slice(0, idx), resourceId: id.slice(idx + 1) }
}

/**
 * Connect Link form: account id + API token. ActiveCollab is multi-instance
 * (the account id lives in the request path), so this is a genuinely bespoke
 * form rather than the single-key `simpleApiKey` shape — hence `customForm`.
 */
const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'accountId',
      label: 'Account ID',
      type: 'text',
      required: true,
      placeholder: '148987',
      helpText:
        'Your cloud account id (the number in your ActiveCollab dashboard URL), or the full origin of a self-hosted instance.',
    },
    {
      name: 'apiKey',
      label: 'API token',
      type: 'password',
      required: true,
      helpText: `Generate an API token from your account. See ${TOKEN_HELP_URL}`,
    },
  ],
  async exchange(fields) {
    const accountId = (fields['accountId'] ?? '').trim()
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!accountId) throw new Error('Account ID is required.')
    if (!apiKey) throw new Error('API token is required.')
    return { accessToken: apiKey, extra: { accountId } }
  },
})

export class ActivecollabAdapter implements ProjectsAdapter {
  readonly platform = 'activecollab'
  readonly version = '0.1.0'

  // Connect Link support — account id + API-token form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return activecollabExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return activecollabRefresh(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyActivecollabWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseActivecollabWebhookEvents(payload)
  }

  private client(credentials: Credentials): ActivecollabClient {
    return new ActivecollabClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    const page = params.page
    return page != null ? { page } : {}
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const res = await this.client(credentials).get<RawActivecollabProject[]>(
      '/projects',
      this.pageParams(params),
    )
    return (res ?? []).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<SingleProjectResponse | RawActivecollabProject>(
      `/projects/${id}`,
    )
    const single = (res as SingleProjectResponse).single ?? (res as RawActivecollabProject)
    if (!single || single.id == null) throw new Error(`ActiveCollab project ${id} not found`)
    return transformProject(single)
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    // GET /projects/{id}/tasks returns { tasks: [...], task_lists: [...], ... }
    // NOT a bare array — unwrap the tasks key before mapping.
    const res = await this.client(credentials).get<TaskListResponse>(
      `/projects/${projectId}/tasks`,
      this.pageParams(params),
    )
    return ((res as TaskListResponse).tasks ?? []).map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // ActiveCollab's single-task GET is path-scoped under its project and there
    // is no global task-by-id endpoint, so the canonical id is the composite
    // `{projectId}:{taskId}` emitted by `transformTask`.
    const { projectId, resourceId } = splitScopedId(id)
    if (!projectId) {
      throw new Error(
        `ActiveCollab task id must be in '{projectId}:{taskId}' form; got '${id}'.`,
      )
    }
    const res = await this.client(credentials).get<SingleTaskResponse>(
      `/projects/${projectId}/tasks/${resourceId}`,
    )
    const single = res.single
    if (!single || single.id == null) throw new Error(`ActiveCollab task ${id} not found`)
    return transformTask(single, projectId)
  }

  // ── Comments ─────────────────────────────────────────────────────────────
  //
  // ActiveCollab has no standalone "list comments on a task" endpoint; the
  // single-task response carries a `comments` array. `taskId` here is the
  // task whose comments we want; the owning project is supplied via
  // `params.project_id`.

  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    // `taskId` is the canonical composite `{projectId}:{taskId}` (preferred);
    // fall back to a bare id plus `params.project_id`.
    const scoped = splitScopedId(taskId)
    const projectId =
      scoped.projectId || (params['project_id'] != null ? String(params['project_id']) : '')
    const resourceId = scoped.resourceId
    if (!projectId) {
      throw new Error(
        `ActiveCollab comments require a project-scoped task id ('{projectId}:{taskId}') or params.project_id.`,
      )
    }
    const res = await this.client(credentials).get<SingleTaskResponse>(
      `/projects/${projectId}/tasks/${resourceId}`,
    )
    return (res.comments ?? []).map((c) => transformComment(c, resourceId, projectId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const res = await this.client(credentials).get<SingleCommentResponse | RawActivecollabComment>(
      `/comments/${id}`,
    )
    const single = (res as SingleCommentResponse).single ?? (res as RawActivecollabComment)
    if (!single || single.id == null) throw new Error(`ActiveCollab comment ${id} not found`)
    return transformComment(single)
  }

  // ── Tags (Labels) ──────────────────────────────────────────────────────────
  //
  // ActiveCollab labels are account-global, so `workspaceId` is accepted for
  // interface compatibility but not used to scope the request.

  async listTags(credentials: Credentials, _workspaceId: string, params: QueryParams): Promise<Tag[]> {
    const res = await this.client(credentials).get<RawActivecollabLabel[]>(
      '/labels',
      this.pageParams(params),
    )
    return (res ?? []).map(transformTag)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const labels = await this.client(credentials).get<RawActivecollabLabel[]>('/labels')
    const found = (labels ?? []).find((l) => String(l.id) === id)
    if (!found) throw new Error(`ActiveCollab label ${id} not found`)
    return transformTag(found)
  }

  // ── Users ────────────────────────────────────────────────────────────────
  //
  // `/users/all` returns every user (active, archived, trashed) as a bare
  // array. `workspaceId` is accepted for interface compatibility but unused.

  async listUsers(credentials: Credentials, _workspaceId: string, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<RawActivecollabUser[]>(
      '/users/all',
      this.pageParams(params),
    )
    return (res ?? []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const users = await this.client(credentials).get<RawActivecollabUser[]>('/users/all')
    const found = (users ?? []).find((u) => String(u.id) === id)
    if (!found) throw new Error(`ActiveCollab user ${id} not found`)
    return transformUser(found)
  }
}

export { DEFAULT_PAGE_SIZE }

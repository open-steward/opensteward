/**
 * Float adapter for the projects vertical.
 *
 * Float is a resource-scheduling platform. Its REST API lives at a single
 * production host, https://api.float.com/v3, authenticated with a long-lived
 * bearer token generated from Account Settings → Integrations (no OAuth2
 * authorization-code flow), so credentials are collected through the Connect
 * Link form (`simpleApiKey`). Every request also carries a descriptive
 * `User-Agent` as Float requires.
 *
 * Supported canonical resources:
 *   - Projects    GET /projects, GET /projects/{project_id}
 *   - Tasks       GET /project-tasks?project_id={pid}, scoped to a project;
 *                 these are Float's named task-list definitions. The canonical
 *                 task id is the composite `{project_id}:{task_id}`.
 *   - Workspaces  GET /clients, GET /clients/{client_id}
 *                 (Float has no workspace; clients are the top-level grouping)
 *   - Users       GET /people, GET /people/{people_id}
 *
 * Intentionally NOT implemented (left off → auto-respond 501):
 *   - Comments — Float has no comment/discussion concept.
 *   - Tags — Float tags are inline string arrays on projects/people, not a
 *     standalone listable resource (surfaced in metadata instead).
 *   - Webhooks — Float v3 exposes no signed webhook delivery, so the adapter
 *     declares no verify/parse hooks.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: comment — Float has no comment or discussion concept in its REST API (v3 reference confirms no comments/notes/annotations endpoints).
 * Unavailable: tag — Float tags are inline string arrays on project/people objects, not standalone listable resources; there is no /tags endpoint.
 */
import { simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import { buildAuthUrl, exchangeCode as floatExchange, refreshCredentials as floatRefresh } from './auth'
import { FloatClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, TOKEN_HELP_URL } from './constants'

import { transformProject, type RawFloatProject } from './transform/project'
import { transformTask, type RawFloatProjectTask } from './transform/task'
import { transformWorkspace, type RawFloatClient } from './transform/workspace'
import { transformUser, type RawFloatPerson } from './transform/user'

/**
 * Split a canonical composite id (`{projectId}:{resourceId}`) into its parts.
 * Project tasks encode their project id this way because Float's project-task
 * lookups are project-scoped. A bare id (no colon) is returned as `resourceId`
 * with an empty `projectId`.
 */
function splitScopedId(id: string): { projectId: string; resourceId: string } {
  const idx = id.indexOf(':')
  if (idx === -1) return { projectId: '', resourceId: id }
  return { projectId: id.slice(0, idx), resourceId: id.slice(idx + 1) }
}

/**
 * Connect Link form: a single Float access token. Float uses bearer-token
 * auth with no OAuth flow, so the single-key `simpleApiKey` shape fits.
 */
const CONNECT_FORM = simpleApiKey({
  label: 'API access token',
  placeholder: 'flt_…',
  helpText: `Generate an access token from your Float Account Settings → Integrations. See ${TOKEN_HELP_URL}`,
})

export class FloatAdapter implements ProjectsAdapter {
  readonly platform = 'float'
  readonly version = '0.1.0'

  // Connect Link support — single API access-token form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return floatExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return floatRefresh(credentials)
  }

  private client(credentials: Credentials): FloatClient {
    return new FloatClient(credentials)
  }

  /** Float pages with a 1-based `page` + `per-page` size (max 200). */
  private pageParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    if (params.page != null) out['page'] = params.page
    const perPage = params.limit ?? DEFAULT_PAGE_SIZE
    out['per-page'] = Math.min(Number(perPage), MAX_PAGE_SIZE)
    return out
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const res = await this.client(credentials).get<RawFloatProject[]>(
      '/projects',
      this.pageParams(params),
    )
    return (res ?? []).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<RawFloatProject>(`/projects/${id}`)
    if (!res || res.project_id == null) throw new Error(`Float project ${id} not found`)
    return transformProject(res)
  }

  // ── Tasks (project task definitions) ─────────────────────────────────────────
  //
  // Float's `/project-tasks` list is filtered to a project via `project_id`.
  // The canonical task id is the composite `{projectId}:{taskId}`.

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const res = await this.client(credentials).get<RawFloatProjectTask[]>('/project-tasks', {
      ...this.pageParams(params),
      project_id: projectId,
    })
    return (res ?? []).map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const { projectId, resourceId } = splitScopedId(id)
    const res = await this.client(credentials).get<RawFloatProjectTask>(
      `/project-tasks/${resourceId}`,
    )
    if (!res || (res.task_id == null && res.project_task_id == null)) {
      throw new Error(`Float project task ${id} not found`)
    }
    return transformTask(res, projectId || undefined)
  }

  // ── Workspaces (Clients) ─────────────────────────────────────────────────────
  //
  // Float has no workspace; clients are the top-level grouping that owns
  // projects (project.client_id).

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const res = await this.client(credentials).get<RawFloatClient[]>(
      '/clients',
      this.pageParams(params),
    )
    return (res ?? []).map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<RawFloatClient>(`/clients/${id}`)
    if (!res || res.client_id == null) throw new Error(`Float client ${id} not found`)
    return transformWorkspace(res)
  }

  // ── Users (People) ───────────────────────────────────────────────────────────
  //
  // Float people belong to the whole account, not a client/workspace, so
  // `workspaceId` is accepted for interface compatibility but not used to
  // scope the request.

  async listUsers(credentials: Credentials, _workspaceId: string, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<RawFloatPerson[]>(
      '/people',
      this.pageParams(params),
    )
    return (res ?? []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawFloatPerson>(`/people/${id}`)
    if (!res || res.people_id == null) throw new Error(`Float person ${id} not found`)
    return transformUser(res)
  }
}

export { DEFAULT_PAGE_SIZE }

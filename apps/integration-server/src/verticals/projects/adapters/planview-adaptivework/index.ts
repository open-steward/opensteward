/**
 * Planview AdaptiveWork (formerly Clarizen) adapter for the projects vertical.
 *
 * AdaptiveWork exposes the Clarizen REST API v2.0. Authentication is a
 * username + password exchanged at login for a short-lived `sessionId`
 * (`Authorization: Session <sessionId>`), routed to the org's data center. The
 * Connect Link form (a `customForm` with `userName` + `password`) runs that
 * login in `exchangeCredentials`; `refreshCredentials` re-logs-in when the
 * session lapses. See `auth.ts`.
 *
 * Canonical mapping (AdaptiveWork's model is Organization > Project > Task,
 * with Discussions posted on work items):
 *   - Projects   ← Project entity     entityQuery typeName=Project / objects/Project/{uuid}
 *   - Tasks      ← Task entity         entityQuery typeName=Task (where Project = …) / objects/Task/{uuid}
 *   - Comments   ← Discussion entity   entityQuery typeName=Discussion (where Container = task)
 *   - Workspaces ← Organization entity the single tenant org (objects/Organization/{uuid})
 *   - Users      ← User entity         entityQuery typeName=User / objects/User/{uuid}
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: tag — AdaptiveWork has no first-class tag/label entity on work
 *   items; the REST API exposes no Tag typeName or equivalent endpoint.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * There is likewise no inbound signed-webhook mechanism on the REST API, so no
 * webhook verification/parsing is implemented.
 *
 * Reads use two shapes:
 *   - `GET data/objects/{TypeName}/{uuid}?fields=…` for single entities.
 *   - `POST data/entityQuery` (`{ typeName, fields, where, paging }`) for
 *     collections, paging via numeric `paging.from` / `paging.limit` and the
 *     `paging.hasMore` flag. Paging type
 *     (https://api.clarizen.com/V2.0/services/types/Paging): "from integer The
 *     record number to start retrieve from", "limit integer Number of records
 *     to retrieve", "hasMore boolean ... indicates whether there are more
 *     records to fetch for this query". Caller page N is sent as
 *     `from = (N - 1) * limit`; no maximum `limit` is documented, so none is
 *     declared.
 *
 * Entity ids are AdaptiveWork URIs (`/Project/<uuid>`); the canonical id keeps
 * the full URI and `objects` GET paths are built from its trailing uuid.
 */
import { customForm, pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  exchangeCode as czExchange,
  login,
  refreshCredentials as czRefresh,
} from './auth'
import { PlanviewAdaptiveworkClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  DISCUSSION_FIELDS,
  ORGANIZATION_FIELDS,
  PROJECT_FIELDS,
  TASK_FIELDS,
  TOKEN_HELP_URL,
  USER_FIELDS,
} from './constants'

import { transformProject, type RawClarizenProject } from './transform/project'
import { transformTask, type RawClarizenTask } from './transform/task'
import { transformComment, type RawClarizenDiscussion } from './transform/comment'
import { transformWorkspace, type RawClarizenOrganization } from './transform/workspace'
import { transformUser, type RawClarizenUser } from './transform/user'
import { idUuid } from './transform/shared'

/** EntityQuery response envelope. */
interface EntityQueryResponse<T> {
  entities?: T[]
  paging?: { from?: number; limit?: number; hasMore?: boolean }
}

/** A simple equality condition on a reference field, e.g. Project = "/Project/uuid". */
interface QueryCondition {
  leftOperand: string
  operator: 'Equal'
  rightOperand: string
}

/**
 * Connect Link form: AdaptiveWork username + password. The exchange logs in,
 * resolving the data center and session, and persists the credentials on
 * `extra` so the session can be refreshed without re-prompting.
 */
const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'userName',
      label: 'Username',
      type: 'text',
      placeholder: 'you@example.com',
      helpText: `Your Planview AdaptiveWork login. See ${TOKEN_HELP_URL}`,
      required: true,
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      required: true,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const userName = (fields['userName'] ?? '').trim()
    const password = fields['password'] ?? ''
    if (!userName || !password) throw new Error('Username and password are required.')
    const { sessionId, baseUrl, userId, organizationId } = await login(userName, password)
    return {
      accessToken: sessionId,
      extra: { baseUrl, userName, password, userId, organizationId },
    }
  },
})

export class PlanviewAdaptiveworkAdapter implements ProjectsAdapter {
  readonly platform = 'planview-adaptivework'
  readonly version = '0.1.0'

  // Connect Link support — username/password form (no OAuth).
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return czExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return czRefresh(credentials)
  }

  private client(credentials: Credentials): PlanviewAdaptiveworkClient {
    return new PlanviewAdaptiveworkClient(credentials)
  }

  /**
   * Numeric-offset paging: `limit` is the caller's page size and `from` the
   * caller page's first record. An explicit `cursor` param names `from`
   * directly.
   */
  private paging(params: QueryParams): { from: number; limit: number } {
    const asked = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const limit = Number.isFinite(asked) && asked >= 1 ? Math.floor(asked) : DEFAULT_PAGE_SIZE
    const from = params['cursor'] ? Number(params['cursor']) || 0 : pageOffset(params, limit)
    return { from, limit }
  }

  /** Run an EntityQuery for a type with optional equality conditions. */
  private async query<T>(
    credentials: Credentials,
    typeName: string,
    fields: readonly string[],
    params: QueryParams,
    where?: QueryCondition,
  ): Promise<T[]> {
    const body: Record<string, unknown> = {
      typeName,
      fields,
      paging: this.paging(params),
    }
    if (where) body['where'] = where
    const res = await this.client(credentials).post<EntityQueryResponse<T>>(
      '/data/entityQuery',
      body,
    )
    const hasMore = res.paging?.hasMore
    if (typeof hasMore === 'boolean') reportUpstreamPage(params, { hasMore })
    return res.entities ?? []
  }

  /** Fetch a single entity by its `/Type/<uuid>` id via the objects endpoint. */
  private async getById<T>(
    credentials: Credentials,
    typeName: string,
    id: string,
    fields: readonly string[],
  ): Promise<T> {
    return this.client(credentials).get<T>(`/data/objects/${typeName}/${idUuid(id)}`, {
      fields: fields.join(','),
    })
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const rows = await this.query<RawClarizenProject>(
      credentials,
      'Project',
      PROJECT_FIELDS,
      params,
    )
    return rows.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const raw = await this.getById<RawClarizenProject>(credentials, 'Project', id, PROJECT_FIELDS)
    if (!raw || !raw.id) throw new Error(`Planview AdaptiveWork project ${id} not found`)
    return transformProject(raw)
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const where: QueryCondition | undefined = projectId
      ? { leftOperand: 'Project', operator: 'Equal', rightOperand: projectId }
      : undefined
    const rows = await this.query<RawClarizenTask>(credentials, 'Task', TASK_FIELDS, params, where)
    return rows.map((t) => transformTask(t, projectId || undefined))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const raw = await this.getById<RawClarizenTask>(credentials, 'Task', id, TASK_FIELDS)
    if (!raw || !raw.id) throw new Error(`Planview AdaptiveWork task ${id} not found`)
    return transformTask(raw)
  }

  // ── Comments (Discussions) ───────────────────────────────────────────────────

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const where: QueryCondition | undefined = taskId
      ? { leftOperand: 'Container', operator: 'Equal', rightOperand: taskId }
      : undefined
    const rows = await this.query<RawClarizenDiscussion>(
      credentials,
      'Discussion',
      DISCUSSION_FIELDS,
      params,
      where,
    )
    return rows.map((d) => transformComment(d, taskId || undefined))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const raw = await this.getById<RawClarizenDiscussion>(
      credentials,
      'Discussion',
      id,
      DISCUSSION_FIELDS,
    )
    if (!raw || !raw.id) throw new Error(`Planview AdaptiveWork discussion ${id} not found`)
    return transformComment(raw)
  }

  // ── Workspaces (Organization) ────────────────────────────────────────────────
  //
  // A connection is scoped to a single AdaptiveWork organization. Its id comes
  // from login (`extra.organizationId`); there is no list-organizations call.

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const orgId = this.orgId(credentials)
    if (!orgId) return pageLocally<Workspace>([], params)
    const raw = await this.getById<RawClarizenOrganization>(
      credentials,
      'Organization',
      orgId,
      ORGANIZATION_FIELDS,
    )
    // The whole collection is this one organization: page it locally.
    return pageLocally(raw && raw.id ? [transformWorkspace(raw)] : [], params)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const raw = await this.getById<RawClarizenOrganization>(
      credentials,
      'Organization',
      id,
      ORGANIZATION_FIELDS,
    )
    if (!raw || !raw.id) throw new Error(`Planview AdaptiveWork organization ${id} not found`)
    return transformWorkspace(raw)
  }

  // ── Users ────────────────────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const ws = workspaceId || this.orgId(credentials)
    const rows = await this.query<RawClarizenUser>(credentials, 'User', USER_FIELDS, params)
    return rows.map((u) => transformUser(u, ws || undefined))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.getById<RawClarizenUser>(credentials, 'User', id, USER_FIELDS)
    if (!raw || !raw.id) throw new Error(`Planview AdaptiveWork user ${id} not found`)
    return transformUser(raw, this.orgId(credentials) || undefined)
  }

  /** The owning organization id resolved at login, if present. */
  private orgId(credentials: Credentials): string | undefined {
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    return typeof extra['organizationId'] === 'string'
      ? (extra['organizationId'] as string)
      : undefined
  }
}

export { DEFAULT_PAGE_SIZE }

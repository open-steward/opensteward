/**
 * BigTime adapter for the projects vertical.
 *
 * BigTime IQ exposes a single-host REST API (v2) at
 * `https://iq.bigtime.net/BigtimeData/api/v2`, authenticated with a permanent
 * firm API token in the `X-Auth-Token` header plus the firm id in the
 * `X-Auth-Realm` header. There is no OAuth2 authorization-code flow for the
 * data API, so credentials are collected through the Connect Link form (a
 * `customForm` with `firmId` + `apiKey`).
 *
 * Supported canonical resources:
 *   - Projects    GET /project, GET /project/detail/{SystemId}
 *   - Tasks       GET /task/listByProject/{ProjectSid}, GET /task/detail/{TaskSid}
 *   - Users       GET /staff (staff members), GET /staff/detail/{StaffSid}
 *   - Workspaces  GET /session/firms — firm list; each firm maps to a workspace
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: comment — BigTime has no task-comment resource; notes are an
 *              inline string on the task itself (no dedicated comment endpoint).
 * Unavailable: tag — BigTime exposes no project/task tag (label) resource via
 *              the API.
 *
 * BigTime publishes no webhooks, so this adapter exposes no webhook hooks.
 */
import { customForm } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { User } from '../../schema/user'
import type { Workspace } from '../../schema/workspace'

import { buildAuthUrl, exchangeCode as bigtimeExchange, refreshCredentials as bigtimeRefresh } from './auth'
import { BigtimeClient } from './client'
import { DEFAULT_PAGE_SIZE, TOKEN_HELP_URL } from './constants'

import { transformProject, type RawBigtimeProject } from './transform/project'
import { transformTask, type RawBigtimeTask } from './transform/task'
import { transformUser, type RawBigtimeStaff } from './transform/user'
import { transformWorkspace, type RawBigtimeFirm } from './transform/workspace'

/**
 * Connect Link form: firm id + permanent firm API token. BigTime selects the
 * firm by the `X-Auth-Realm` header rather than a per-tenant host, so the firm
 * id is a genuine second field — hence `customForm` rather than `simpleApiKey`.
 */
const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'firmId',
      label: 'Firm ID',
      type: 'text',
      required: true,
      placeholder: 'a1b2c3d4',
      helpText: `Your BigTime firm id (the realm sent on every request). See ${TOKEN_HELP_URL}`,
    },
    {
      name: 'apiKey',
      label: 'API token',
      type: 'password',
      required: true,
      helpText: `Generate a permanent firm API token from your BigTime account. See ${TOKEN_HELP_URL}`,
    },
  ],
  async exchange(fields) {
    const firmId = (fields['firmId'] ?? '').trim()
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!firmId) throw new Error('Firm ID is required.')
    if (!apiKey) throw new Error('API token is required.')
    return { accessToken: apiKey, extra: { firmId } }
  },
})

export class BigtimeAdapter implements ProjectsAdapter {
  readonly platform = 'bigtime'
  readonly version = '0.1.0'

  // Connect Link support — firm id + API-token form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return bigtimeExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return bigtimeRefresh(credentials)
  }

  private client(credentials: Credentials): BigtimeClient {
    return new BigtimeClient(credentials)
  }

  /** Firm id carried on the credential — surfaced as the canonical workspace id. */
  private firmId(credentials: Credentials): string | undefined {
    const v = credentials.extra?.['firmId']
    return v != null ? String(v) : undefined
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const firmId = this.firmId(credentials)
    const showInactive = params['show_inactive'] === true || params['show_inactive'] === 'true'
    const res = await this.client(credentials).get<RawBigtimeProject[]>('/project', {
      ...(showInactive ? { ShowInactive: 'true' } : {}),
    })
    return (res ?? []).map((p) => transformProject(p, firmId))
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const firmId = this.firmId(credentials)
    const res = await this.client(credentials).get<RawBigtimeProject>(`/project/detail/${id}`, {
      View: 'Detailed',
    })
    if (!res || res.SystemId == null) throw new Error(`BigTime project ${id} not found`)
    return transformProject(res, firmId)
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async listTasks(credentials: Credentials, projectId: string, _params: QueryParams): Promise<Task[]> {
    const res = await this.client(credentials).get<RawBigtimeTask[]>(
      `/task/listByProject/${projectId}`,
    )
    return (res ?? []).map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<RawBigtimeTask>(`/task/detail/${id}`)
    if (!res || res.TaskSid == null) throw new Error(`BigTime task ${id} not found`)
    return transformTask(res)
  }

  // ── Users (Staff) ──────────────────────────────────────────────────────────
  //
  // BigTime staff are firm-global, so `workspaceId` is accepted for interface
  // compatibility but the request is not scoped by it.

  async listUsers(credentials: Credentials, _workspaceId: string, params: QueryParams): Promise<User[]> {
    const firmId = this.firmId(credentials)
    const showInactive = params['show_inactive'] === true || params['show_inactive'] === 'true'
    const res = await this.client(credentials).get<RawBigtimeStaff[]>('/staff', {
      ...(showInactive ? { ShowInactive: 'true' } : {}),
    })
    return (res ?? []).map((u) => transformUser(u, firmId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const firmId = this.firmId(credentials)
    const res = await this.client(credentials).get<RawBigtimeStaff>(`/staff/detail/${id}`)
    if (!res || res.StaffSid == null) throw new Error(`BigTime staff ${id} not found`)
    return transformUser(res, firmId)
  }

  // ── Workspaces (Firms) ────────────────────────────────────────────────────
  //
  // BigTime's `/session/firms` endpoint lists all firms accessible to the
  // authenticated token. Each firm maps directly to the canonical Workspace
  // shape — a firm is the top-level organisational tenant in BigTime.

  async listWorkspaces(credentials: Credentials, _params: QueryParams): Promise<Workspace[]> {
    const res = await this.client(credentials).get<RawBigtimeFirm[]>('/session/firms')
    return (res ?? []).map((f) => transformWorkspace(f))
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<RawBigtimeFirm[]>('/session/firms')
    const found = (res ?? []).find((f) => String(f.id) === id)
    if (!found) throw new Error(`BigTime firm ${id} not found`)
    return transformWorkspace(found)
  }
}

export { DEFAULT_PAGE_SIZE }

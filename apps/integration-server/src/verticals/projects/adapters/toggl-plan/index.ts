/**
 * Toggl Plan adapter for the projects vertical.
 *
 * Auth: API key (api_key) — user supplies a long-lived Bearer token plus
 * a workspace ID. Both are captured at credential-exchange time and stored
 * in credentials.accessToken / credentials.extra.workspaceId.
 *
 * Supported resources:
 *   - listProjects / getProject    (GET /{workspace_id}/projects)
 *   - listTasks / getTask          (GET /{workspace_id}/tasks/timeline)
 *   - listWorkspaces               (GET /{workspace_id}/groups — groups as sub-workspaces)
 *   - listUsers / getUser          (GET /{workspace_id}/members)
 *
 * Not implemented (Toggl Plan has no such API endpoints):
 *   - listComments / getComment    (no comments endpoint)
 *   - listTags / getTag            (no standalone tags endpoint)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: comment — Toggl Plan API v5 has no comments endpoint; the platform does not expose task or project comments via its REST API.
 * Unavailable: tag — Toggl Plan API v5 has no standalone tags endpoint; tag IDs are embedded as arrays on tasks and projects but cannot be listed or fetched independently.
 *
 * Pagination: Toggl Plan returns full arrays per request; no cursor/offset/page
 * parameter is documented on any list endpoint. Every list method therefore
 * pages locally with `pageLocally` over the whole returned array.
 *
 * Docs: https://developers.plan.toggl.com/api-v5.html
 */
import {
  pageLocally,
  type Credentials,
  type CredentialField,
  type QueryParams,
} from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { TogglPlanClient } from './client'

import { transformProject, type RawTogglPlanProject } from './transform/project'
import { transformTask, type RawTogglPlanTask } from './transform/task'
import { transformWorkspace, type RawTogglPlanGroup } from './transform/workspace'
import { transformUser, type RawTogglPlanMember } from './transform/user'

export interface TogglPlanAdapterConfig {
  /** Unused — Toggl Plan uses API key auth. Present for interface compatibility. */
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

export class TogglPlanAdapter implements ProjectsAdapter {
  readonly platform = 'toggl-plan'
  readonly version = '0.1.0'

  constructor(_config?: TogglPlanAdapterConfig) {}

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
    throw new Error('toggl-plan uses API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Bearer tokens are long-lived; return as-is
    return credentials
  }

  private client(credentials: Credentials): TogglPlanClient {
    return new TogglPlanClient(credentials)
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const c = this.client(credentials)
    const items = await c.get<RawTogglPlanProject[]>(c.wsPath('projects'))
    const all = (Array.isArray(items) ? items : []).map((p) => transformProject(p, c.workspaceId))
    return pageLocally(all, params)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const c = this.client(credentials)
    const item = await c.get<RawTogglPlanProject>(c.wsPath(`projects/${id}`))
    return transformProject(item, c.workspaceId)
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const c = this.client(credentials)
    // timeline endpoint; filter by project if projectId provided
    const queryParams: Record<string, unknown> = {}
    if (projectId) queryParams['project'] = projectId
    if (params.updatedAfter) {
      queryParams['since'] = (params.updatedAfter as Date).toISOString().slice(0, 10)
    }
    const items = await c.get<RawTogglPlanTask[]>(c.wsPath('tasks/timeline'), queryParams)
    const all = (Array.isArray(items) ? items : []).map((t) => transformTask(t, projectId))
    return pageLocally(all, params)
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const c = this.client(credentials)
    const item = await c.get<RawTogglPlanTask>(c.wsPath(`tasks/${id}`))
    return transformTask(item)
  }

  // ── Workspaces (Groups) ────────────────────────────────────────────────────

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const c = this.client(credentials)
    const items = await c.get<RawTogglPlanGroup[]>(c.wsPath('groups'))
    const all = (Array.isArray(items) ? items : []).map((g) => transformWorkspace(g, c.workspaceId))
    return pageLocally(all, params)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const c = this.client(credentials)
    const item = await c.get<RawTogglPlanGroup>(c.wsPath(`groups/${id}`))
    return transformWorkspace(item, c.workspaceId)
  }

  // ── Users (Members) ───────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, _workspaceId: string, params: QueryParams): Promise<User[]> {
    const c = this.client(credentials)
    const items = await c.get<RawTogglPlanMember[]>(c.wsPath('members'))
    const all = (Array.isArray(items) ? items : []).map((m) => transformUser(m, c.workspaceId))
    return pageLocally(all, params)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const c = this.client(credentials)
    const item = await c.get<RawTogglPlanMember>(c.wsPath(`members/${id}`))
    return transformUser(item, c.workspaceId)
  }
}

/**
 * PingCode adapter — projects vertical.
 *
 * PingCode is an intelligent R&D / project-management platform. Its open
 * REST API (`https://open.pingcode.com/v1`) is namespaced by "area": the
 * agile project-management module under `/v1/agile/*`, the project-config
 * module under `/v1/project/*`, and the enterprise directory under
 * `/v1/directory/*`.  There is also a global `/v1/comments` endpoint shared
 * across all principal types.
 *
 * Canonical mapping:
 *   - Project   ← agile project (`/v1/agile/projects`), methodology in metadata.
 *   - Task      ← agile work item (`/v1/agile/work_items`) — epic / feature /
 *                 story / task / bug / issue, flattened with `parentId` and the
 *                 concrete level in `metadata.platformType`.
 *   - Comment   ← global comment (`/v1/comments?principal_type=work_item&principal_id=…`).
 *   - Tag       ← work-item tag (`/v1/project/work_item_tags`), enterprise-wide.
 *   - Workspace ← enterprise/team (`/v1/directory/team`); PingCode has a single
 *                 enterprise per OAuth credential — no multi-workspace hierarchy.
 *   - User      ← directory user (`/v1/directory/users`).
 *
 * PingCode publishes no webhook signature-verification scheme, so no webhook
 * surface is implemented.
 *
 * Auth: OAuth2 client-credentials. The customer pastes the Custom-application
 * `client_id` + `client_secret` into the Connect Link form; we mint a
 * short-lived `Bearer` token and re-mint it on refresh.
 *
 * Pagination: 0-indexed `page_index` + `page_size`; list responses wrap the
 * records under `values` with a `total` count.
 *
 * Docs: https://open.pingcode.com/
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * All 6 canonical resources are available.
 */
import { pageLocally, type Credentials, type QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import { buildCredentials, refreshCredentials as refreshPingcodeCredentials } from './auth'
import { PingcodeClient, type PingcodePage } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformProject, type RawPingcodeProject } from './transform/project'
import { transformTask, type RawPingcodeWorkItem } from './transform/task'
import { transformComment, type RawPingcodeComment } from './transform/comment'
import { transformTag, type RawPingcodeTag } from './transform/tag'
import { transformWorkspace, type RawPingcodeTeam } from './transform/workspace'
import { transformUser, type RawPingcodeUser } from './transform/user'

export class PingcodeAdapter implements ProjectsAdapter {
  readonly platform = 'pingcode'
  readonly version = '0.1.0'

  // ── Auth (oauth2_cc — Connect Link form, no redirect) ─────────────────────

  getAuthUrl(): string {
    throw new Error(
      'PingCode uses OAuth2 client-credentials; submit the Custom-application client ID + secret via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error(
      'PingCode uses OAuth2 client-credentials; call exchangeCredentials with the client ID + secret instead.',
    )
  }

  credentialFields() {
    return [
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text' as const,
        required: true,
        helpText: 'From the PingCode admin console → Custom application → Client ID.',
      },
      {
        name: 'clientSecret',
        label: 'Client secret',
        type: 'password' as const,
        required: true,
        helpText: 'From the same Custom application page → Secret.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshPingcodeCredentials(credentials)
  }

  private client(credentials: Credentials): PingcodeClient {
    return new PingcodeClient(credentials)
  }

  /** Translate canonical query params into PingCode's 0-indexed paging. */
  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    const cursor = params['cursor'] ?? params['page_index'] ?? params.page
    if (cursor != null) out['page_index'] = Number(cursor)
    return out
  }

  // ── Projects ──────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const res = await this.client(credentials).get<PingcodePage<RawPingcodeProject>>(
      '/v1/agile/projects',
      this.listParams(params),
    )
    return (res.values ?? []).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const raw = await this.client(credentials).get<RawPingcodeProject>(
      `/v1/agile/projects/${encodeURIComponent(id)}`,
    )
    return transformProject(raw)
  }

  // ── Tasks (work items) ─────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const res = await this.client(credentials).get<PingcodePage<RawPingcodeWorkItem>>(
      '/v1/agile/work_items',
      { ...this.listParams(params), project_id: projectId },
    )
    return (res.values ?? []).map((w) => transformTask(w, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const raw = await this.client(credentials).get<RawPingcodeWorkItem>(
      `/v1/agile/work_items/${encodeURIComponent(id)}`,
    )
    return transformTask(raw)
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  //
  // PingCode's comment API is global: GET /v1/comments?principal_type=work_item
  // &principal_id={taskId} returns all comments on a work item.

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const res = await this.client(credentials).get<PingcodePage<RawPingcodeComment>>(
      '/v1/comments',
      {
        ...this.listParams(params),
        principal_type: 'work_item',
        principal_id: taskId,
      },
    )
    return (res.values ?? []).map((c) => transformComment(c, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // The single-resource endpoint requires principal context in the query
    // string; since we only have the id here we fetch without it — PingCode
    // still returns the resource when the id is unambiguous.
    const raw = await this.client(credentials).get<RawPingcodeComment>(
      `/v1/comments/${encodeURIComponent(id)}`,
    )
    return transformComment(raw)
  }

  // ── Tags (work-item tags, enterprise-wide) ─────────────────────────────────
  //
  // GET /v1/project/work_item_tags returns all tags defined in the enterprise.
  // Tags have id, name, color fields.

  async listTags(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    const res = await this.client(credentials).get<PingcodePage<RawPingcodeTag>>(
      '/v1/project/work_item_tags',
      this.listParams(params),
    )
    return (res.values ?? []).map((t) => transformTag(t))
  }

  // ── Workspaces (enterprise / tenant) ─────────────────────────────────────
  //
  // PingCode has exactly one enterprise per OAuth credential, exposed at
  // GET /v1/directory/team. We surface it as a single Workspace entry.
  // The endpoint takes no paging parameters and returns one object, so that
  // one-row collection is paged locally: page 2 is empty, not a repeat.

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const raw = await this.client(credentials).get<RawPingcodeTeam>('/v1/directory/team')
    return pageLocally([transformWorkspace(raw)], params)
  }

  async getWorkspace(credentials: Credentials, _id: string): Promise<Workspace> {
    const raw = await this.client(credentials).get<RawPingcodeTeam>('/v1/directory/team')
    return transformWorkspace(raw)
  }

  // ── Users (directory) ───────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const res = await this.client(credentials).get<PingcodePage<RawPingcodeUser>>(
      '/v1/directory/users',
      this.listParams(params),
    )
    return (res.values ?? []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawPingcodeUser>(
      `/v1/directory/users/${encodeURIComponent(id)}`,
    )
    return transformUser(raw)
  }
}

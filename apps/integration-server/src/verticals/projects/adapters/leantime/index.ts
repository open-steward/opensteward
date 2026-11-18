/**
 * Leantime adapter for the projects vertical.
 *
 * Leantime is a self-hosted, open-source project management tool that exposes
 * its functionality through a JSON-RPC 2.0 API at {baseUrl}/api/jsonrpc.
 * Authentication uses a long-lived API key sent in the `x-api-key` header.
 *
 * There is no fixed cloud URL — every installation has its own domain. The
 * `baseUrl` is collected alongside the `apiKey` through the Connect Link form
 * (`simpleApiKey` shim with a custom form). Both are stored in
 * `credentials.extra`; `credentials.accessToken` holds the key.
 *
 * Supported canonical resources:
 *   - Projects   leantime.rpc.Projects.Projects.getAll (list),
 *                leantime.rpc.Projects.getProject (single)
 *   - Tasks      leantime.rpc.Tickets.getAll (list by projectId),
 *                leantime.rpc.Tickets.getTicket (single)
 *   - Comments   leantime.rpc.Comments.getComments (list by taskId),
 *   - Users      leantime.rpc.Users.getAll (list),
 *                leantime.rpc.Users.getUser (single)
 *
 * Tags, Workspaces are intentionally NOT implemented: Leantime has no tag
 * entity in its API surface and no workspace concept (single-tenant). Those
 * interface methods are left off and auto-respond 501.
 *
 * Pagination: none of the four list RPCs documents a paging parameter
 * (docs.leantime.io/api/classes/Leantime/Domain/<Domain>/Services/<Service>.md);
 * each returns the whole collection per call, so every list method pages it
 * locally with `pageLocally`.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: tag       — Tags service only exposes getTags(projectId,term) for autocomplete (plain strings, no IDs); no listTags/getTag method exists.
 * Unavailable: workspace — Leantime is single-tenant self-hosted; no workspace/organisation concept or API domain.
 */
import { customForm, pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  exchangeCode as leantimeExchange,
  refreshCredentials as leantimeRefresh,
} from './auth'
import { LeantimeClient } from './client'
import { API_KEY_HELP_URL } from './constants'

import { transformProject, type RawLeantimeProject } from './transform/project'
import { transformTicket, type RawLeantimeTicket } from './transform/task'
import { transformComment, type RawLeantimeComment } from './transform/comment'
import { transformUser, type RawLeantimeUser } from './transform/user'

/** Connect Link form: base URL + API key. */
const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'baseUrl',
      label: 'Leantime Instance URL',
      type: 'url',
      required: true,
      helpText: 'Base URL of your Leantime installation, e.g. https://pm.acme.com',
    },
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText:
        `Generate an API key from your Leantime Company Settings (format: lt_{username}_{hash}). ` +
        `See ${API_KEY_HELP_URL}`,
    },
  ],
  async exchange(fields) {
    const baseUrl = (fields['baseUrl'] ?? '').trim().replace(/\/$/, '')
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!baseUrl) throw new Error('Leantime Instance URL is required.')
    if (!apiKey) throw new Error('Leantime API Key is required.')
    return {
      accessToken: apiKey,
      extra: { baseUrl, apiKey },
    }
  },
})

export class LeantimeAdapter implements ProjectsAdapter {
  readonly platform = 'leantime'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return leantimeExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return leantimeRefresh(credentials)
  }

  private client(credentials: Credentials): LeantimeClient {
    return new LeantimeClient(credentials)
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const result = await this.client(credentials).call<RawLeantimeProject[] | null>(
      'leantime.rpc.Projects.Projects.getAll',
      { showClosedProjects: 'true' },
    )
    return pageLocally((result ?? []).map(transformProject), params)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const result = await this.client(credentials).call<RawLeantimeProject | null>(
      'leantime.rpc.Projects.getProject',
      { id: Number(id) },
    )
    if (!result) throw new Error(`Leantime project ${id} not found`)
    return transformProject(result)
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const result = await this.client(credentials).call<RawLeantimeTicket[] | null>(
      'leantime.rpc.Tickets.getAll',
      { searchCriteria: { projectId: Number(projectId) } },
    )
    return pageLocally(
      (result ?? []).map((t) => transformTicket(t, projectId)),
      params,
    )
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const result = await this.client(credentials).call<RawLeantimeTicket | null>(
      'leantime.rpc.Tickets.getTicket',
      { id: Number(id) },
    )
    if (!result) throw new Error(`Leantime ticket ${id} not found`)
    return transformTicket(result)
  }

  // ── Comments ─────────────────────────────────────────────────────────────
  //
  // Comments in Leantime are scoped to a module + entityId. For tickets the
  // module is 'ticket'.

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const result = await this.client(credentials).call<RawLeantimeComment[] | null>(
      'leantime.rpc.Comments.getComments',
      { module: 'ticket', entityId: Number(taskId) },
    )
    return pageLocally(
      (result ?? []).map((c) => transformComment(c, taskId)),
      params,
    )
  }

  // ── Users ────────────────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const result = await this.client(credentials).call<RawLeantimeUser[] | null>(
      'leantime.rpc.Users.getAll',
      { activeOnly: false },
    )
    return pageLocally((result ?? []).map(transformUser), params)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const result = await this.client(credentials).call<RawLeantimeUser | null>(
      'leantime.rpc.Users.getUser',
      { id: Number(id) },
    )
    if (!result) throw new Error(`Leantime user ${id} not found`)
    return transformUser(result)
  }
}

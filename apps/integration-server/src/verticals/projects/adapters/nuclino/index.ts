/**
 * Nuclino adapter for the projects vertical.
 *
 * Auth: API key — passed directly in the Authorization header (no Bearer prefix).
 *
 * Nuclino data model → canonical mapping:
 *   Team        → Workspace  (GET /v0/teams, GET /v0/teams/:id)
 *   Workspace   → Project    (GET /v0/workspaces, GET /v0/workspaces/:id)
 *   Item/Coll.  → Task       (GET /v0/items, GET /v0/items/:id)
 *   User        → User       (GET /v0/users/:id — no list endpoint)
 *
 * Not implemented (no Nuclino equivalent):
 *   - Comments (no comment endpoint in the public API)
 *   - Tags     (no tag/label concept in the public API)
 *   - Webhooks (not documented in the public API)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: comment — Nuclino has no comment endpoint in its public REST API;
 *              threaded comments are UI-only and not exposed via /v0.
 * Unavailable: tag     — Nuclino has no tag or label concept in its public REST API;
 *              the closest equivalent (select/multiSelect custom fields) are
 *              item-level structured fields, not tags.
 *
 * Pagination: cursor-based via `after` (UUID) + `limit` (1-100, default 100).
 * No next token is returned: the next page starts after the last id of a full
 * page, and `pageByCursor` maps the caller's 1-based `page` onto that chain.
 *
 * Docs: https://help.nuclino.com/d3a29686-api
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
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
import { NuclinoClient, type NuclinoListEnvelope, type NuclinoSingleEnvelope } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformProject, type RawNuclinoWorkspace } from './transform/project'
import { transformTask, type RawNuclinoItem } from './transform/task'
import { transformWorkspace, type RawNuclinoTeam } from './transform/workspace'
import { transformUser, type RawNuclinoUser } from './transform/user'

export interface NuclinoAdapterConfig {
  /** Unused — Nuclino uses API key auth. Present for interface compatibility. */
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

export class NuclinoAdapter implements ProjectsAdapter {
  readonly platform = 'nuclino'
  readonly version = '0.1.0'
  /** Every list method pages at the caller size up to this, via `limit` + `after`. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config?: NuclinoAdapterConfig) {}

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
    throw new Error('nuclino uses API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys are long-lived; no refresh needed
    return credentials
  }

  private client(credentials: Credentials): NuclinoClient {
    return new NuclinoClient(credentials)
  }

  /**
   * One caller page of a Nuclino list. Every list endpoint takes `limit`
   * (1-100) and `after` (an object id: "Only return … that come after the
   * given … ID"), and returns no next token, so the next page starts after
   * the last id of a full page and a short page is the end. `pageByCursor`
   * walks that chain so caller page N is upstream page N at the caller's size.
   * An explicit `cursor` param is still sent as `after` and names the upstream
   * page directly.
   */
  private async listRows<T extends { id: string }>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    filters: Record<string, string>,
  ): Promise<T[]> {
    const requested = Math.floor(Number(params.limit ?? DEFAULT_PAGE_SIZE))
    const size = Math.min(
      MAX_PAGE_SIZE,
      Number.isFinite(requested) && requested >= 1 ? requested : DEFAULT_PAGE_SIZE,
    )
    const clamped = typeof params.limit === 'number' && params.limit > size
    const client = this.client(credentials)
    const fetchPage = async (after: string | undefined) => {
      const q: Record<string, unknown> = { limit: size, ...filters }
      if (after !== undefined) q['after'] = after
      const res = await client.get<NuclinoListEnvelope<T>>(path, q)
      const items = res.data?.results ?? []
      const last = items[items.length - 1]
      return { items, next: items.length >= size && last ? last.id : null }
    }

    let result: { items: T[]; hasMore: boolean }
    if (params['cursor']) {
      const res = await fetchPage(String(params['cursor']))
      result = { items: res.items, hasMore: res.next != null }
    } else {
      const key = cursorPagerKey(connectionScope('nuclino', credentials), path, {
        ...filters,
        limit: size,
      })
      result = await pageByCursor<T>(key, params.page, fetchPage)
    }
    reportUpstreamPage(params, { hasMore: result.hasMore, ...(clamped ? { pageSize: size } : {}) })
    return result.items
  }

  private listFilters(params: QueryParams): Record<string, string> {
    const f: Record<string, string> = {}
    if (params['teamId']) f['teamId'] = String(params['teamId'])
    if (params['workspaceId']) f['workspaceId'] = String(params['workspaceId'])
    return f
  }

  // ── Workspaces (Teams) ─────────────────────────────────────────────────────

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const rows = await this.listRows<RawNuclinoTeam>(
      credentials,
      '/teams',
      params,
      this.listFilters(params),
    )
    return rows.map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<NuclinoSingleEnvelope<RawNuclinoTeam>>(
      `/teams/${id}`,
    )
    return transformWorkspace(res.data)
  }

  // ── Projects (Workspaces) ──────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const rows = await this.listRows<RawNuclinoWorkspace>(
      credentials,
      '/workspaces',
      params,
      this.listFilters(params),
    )
    return rows.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<NuclinoSingleEnvelope<RawNuclinoWorkspace>>(
      `/workspaces/${id}`,
    )
    return transformProject(res.data)
  }

  // ── Tasks (Items + Collections) ────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const rows = await this.listRows<RawNuclinoItem>(credentials, '/items', params, {
      ...this.listFilters(params),
      workspaceId: projectId,
    })
    return rows.map((item) => transformTask(item, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<NuclinoSingleEnvelope<RawNuclinoItem>>(
      `/items/${id}`,
    )
    return transformTask(res.data)
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<NuclinoSingleEnvelope<RawNuclinoUser>>(
      `/users/${id}`,
    )
    return transformUser(res.data)
  }
}

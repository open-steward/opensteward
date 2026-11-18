/**
 * Nutcache adapter for the projects vertical.
 *
 * Auth: nut-basic Base64(publicKey:username:password) + OrganizationGuid header.
 * Resources: organizations (workspaces), projects, project_members (users).
 *
 * Docs: https://nutcache.github.io/apidocs/
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: comment — Nutcache public REST API exposes no comments or notes endpoint (confirmed: https://nutcache.github.io/apidocs/)
// Unavailable: tag     — Nutcache public REST API exposes no tags or labels endpoint (confirmed: https://nutcache.github.io/apidocs/)
// Unavailable: task    — Nutcache public REST API exposes no tasks endpoint; tasks exist in the UI but are not surfaced via any documented REST endpoint (confirmed: https://nutcache.github.io/apidocs/)

import { reportUpstreamPage, type Credentials, type CredentialField, type QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { NutcacheClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformProject, type RawNutcacheProject } from './transform/project'
import { transformWorkspace, type RawNutcacheOrganization } from './transform/workspace'
import { transformUser, type RawNutcacheMember } from './transform/user'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface NutcacheAdapterConfig {
  // No OAuth config needed — purely credential-field based
}

/**
 * A Nutcache list response: the rows under the resource's own key
 * (`projects`, `organizations`, `project_members`) beside a `links` array
 * whose `navigation-next` entry points at the next page.
 */
type NutcacheList<K extends string, T> = { links?: { rel?: string }[] } & { [P in K]?: T[] }

export class NutcacheAdapter implements ProjectsAdapter {
  readonly platform = 'nutcache'
  readonly version = '0.1.0'
  /** Every list pages by `page` + `limit`, `limit` at most {@link MAX_PAGE_SIZE}. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config?: NutcacheAdapterConfig) {}

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
    throw new Error('nutcache uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static API key — no refresh needed
    return credentials
  }

  private client(credentials: Credentials): NutcacheClient {
    return new NutcacheClient(credentials)
  }

  /**
   * Page-number paging, per https://nutcache.github.io/apidocs/ ("Pagination"):
   * "To scroll through the pages, add the parameter page to the query string.
   * The page number starts with 1. By default, the number of objects returned
   * per page is 10 and is limited to 100."
   */
  private pageParams(params: QueryParams): { page: number; limit: number } {
    return {
      page: params.page ?? 1,
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  /**
   * One upstream page of `key` rows. The next page is signalled by a
   * `navigation-next` entry in `links`; a bare array is tolerated as a single
   * page with no next link.
   */
  private async listPage<K extends string, T>(
    credentials: Credentials,
    path: string,
    key: K,
    params: QueryParams,
  ): Promise<T[]> {
    const query = this.pageParams(params)
    const res = await this.client(credentials).get<NutcacheList<K, T> | T[] | null>(path, query)
    const rows: T[] = Array.isArray(res) ? res : (res?.[key] ?? [])
    const links = Array.isArray(res) ? [] : (res?.links ?? [])
    reportUpstreamPage(params, {
      hasMore: links.some((l) => l?.rel === 'navigation-next'),
      ...(params.limit !== undefined && query.limit < params.limit ? { pageSize: query.limit } : {}),
    })
    return rows
  }

  // ── Workspaces (Organizations) ────────────────────────────────────────────

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const rows = await this.listPage<'organizations', RawNutcacheOrganization>(
      credentials,
      '/organizations',
      'organizations',
      params,
    )
    return rows.map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const raw = await this.client(credentials).get<RawNutcacheOrganization>(
      `/organizations/${id}`,
    )
    if (!raw) throw new Error(`Nutcache organization ${id} not found`)
    return transformWorkspace(raw)
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const rows = await this.listPage<'projects', RawNutcacheProject>(credentials, '/projects', 'projects', params)
    return rows.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const raw = await this.client(credentials).get<RawNutcacheProject>(`/projects/${id}`)
    if (!raw) throw new Error(`Nutcache project ${id} not found`)
    return transformProject(raw)
  }

  // ── Users (Project Members) ───────────────────────────────────────────────

  async listUsers(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<User[]> {
    // Nutcache members are scoped to a project; we use workspaceId as a project id here
    // for the projects vertical convention, falling back to listing from first project if needed.
    const projectId = params['project_id'] ?? workspaceId
    const rows = await this.listPage<'project_members', RawNutcacheMember>(
      credentials,
      `/projects/${projectId}/project_members`,
      'project_members',
      params,
    )
    return rows.map((m) => transformUser(m, workspaceId))
  }
}

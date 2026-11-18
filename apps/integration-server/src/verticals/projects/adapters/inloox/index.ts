/**
 * InLoox adapter for the projects vertical.
 *
 * InLoox is a project management platform with an OData REST API at
 * `https://app.inloox.com/api/v1/odata/`. Authentication uses a long-lived
 * Personal Access Token (PAT) passed in the `x-api-key` header. There is no
 * OAuth2 authorization-code flow for the public API, so credentials are
 * collected via the Connect Link form (single API-key field via `simpleApiKey`).
 *
 * Canonical mapping:
 *   Projects ← /Project    OData collection
 *   Tasks    ← /Task       OData collection
 *   Users    ← /Contact    OData collection (IsIdentity=true contacts are users)
 *
 * Not implemented (InLoox OData API does not expose these):
 *   Workspaces — no workspace/organisation listing endpoint in the OData API
 *   Comments   — no comment/discussion endpoint in the OData API
 *   Tags       — no tag/label endpoint in the OData API
 *   Webhooks   — no documented webhook signing/verification
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: comment   — InLoox OData API (v1) exposes no comment or discussion endpoint
 * Unavailable: tag       — InLoox OData API (v1) exposes no tag or label endpoint
 * Unavailable: workspace — InLoox OData API (v1) exposes no workspace or portfolio listing endpoint
 *
 * Pagination: OData `$top` / `$skip`; response envelope is `{ value: T[] }`.
 * InLoox's OpenAPI (https://app.inloox.com/api/v1/openapi/v2.json, served by
 * the Scalar page at /api/v1/swagger/index.html) documents `$top` "Show only
 * the first n items" and `$skip` "Skip the first n items" on every collection
 * GET, and a collection response whose only property is `value`: no next link
 * and no count in the documented response (`$count` is listed as a query
 * option, but no `@odata.count` appears in any response schema), so a page
 * shorter than `$top` is the end. Page `page` at `limit` is
 * `$top=limit&$skip=(page-1)*limit`. No maximum `$top` is documented, so no
 * `maxPageSize` is declared.
 *
 * Docs: https://app.inloox.com/api/v1/swagger/index.html
 * Token: https://login.inloox.com/Manage/PersonalAccessToken
 */
import { pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  exchangeCode as inlooxExchange,
  refreshCredentials as inlooxRefresh,
} from './auth'
import { InlooxClient } from './client'
import { DEFAULT_PAGE_SIZE, TOKEN_HELP_URL } from './constants'

import { transformProject, type RawInlooxProject } from './transform/project'
import { transformTask, type RawInlooxTask } from './transform/task'
import { transformUser, type RawInlooxContact } from './transform/user'

/** OData response envelope used by all InLoox collection endpoints. */
interface ODataList<T> {
  value?: T[]
  '@odata.nextLink'?: string
}

/**
 * OData single-entity response type.
 * GET /Entity({key}) returns the entity object directly as the JSON root —
 * there is no `value` wrapper (that envelope is only used for collections).
 * We add an index signature so the raw OData context properties
 * (`@odata.context` etc.) do not cause excess-property-check errors.
 */
type ODataSingle<T> = T & { [key: string]: unknown }

/** Connect Link form: single Personal Access Token field. */
const CONNECT_FORM = simpleApiKey({
  label: 'Personal Access Token',
  placeholder: 'your-inloox-personal-access-token',
  helpText: `Generate a PAT at ${TOKEN_HELP_URL}`,
})

/** The caller's limit as a whole number ≥ 1; the default when it names none. */
function pageSize(params: QueryParams): number {
  const n = Math.floor(Number(params.limit))
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_PAGE_SIZE
}

export class InlooxAdapter implements ProjectsAdapter {
  readonly platform = 'inloox'
  readonly version = '0.1.0'

  // Connect Link support — single PAT form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return inlooxExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return inlooxRefresh(credentials)
  }

  private client(credentials: Credentials): InlooxClient {
    return new InlooxClient(credentials)
  }

  /**
   * OData paging params for the caller's page: `$top` is the caller's limit
   * and `$skip` the rows of the pages before it (`page` is 1-based).
   */
  private odataParams(params: QueryParams): { $top: number; $skip?: number } {
    const top = pageSize(params)
    const skip = pageOffset(params, top)
    return skip > 0 ? { $top: top, $skip: skip } : { $top: top }
  }

  /**
   * Fetch one OData collection page and report whether more rows follow.
   * InLoox's documented response has no next link or count, so a full page
   * may have more and a short page is the end; a `@odata.nextLink`, if one
   * ever comes back, says there is more.
   */
  private async listCollection<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    filter?: string,
  ): Promise<T[]> {
    const paging = this.odataParams(params)
    const res = await this.client(credentials).get<ODataList<T>>(
      path,
      filter === undefined ? paging : { ...paging, $filter: filter },
    )
    const rows = res.value ?? []
    reportUpstreamPage(params, {
      hasMore: Boolean(res['@odata.nextLink']) || rows.length >= paging.$top,
    })
    return rows
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const rows = await this.listCollection<RawInlooxProject>(credentials, '/Project', params)
    return rows.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<ODataSingle<RawInlooxProject>>(`/Project(${id})`)
    if (!res.ProjectId) throw new Error(`InLoox project ${id} not found`)
    return transformProject(res)
  }

  // ── Tasks ────────────────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const rows = await this.listCollection<RawInlooxTask>(
      credentials,
      '/Task',
      params,
      `ProjectId eq ${projectId}`,
    )
    return rows.map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<ODataSingle<RawInlooxTask>>(`/Task(${id})`)
    if (!res.TaskId) throw new Error(`InLoox task ${id} not found`)
    return transformTask(res)
  }

  // ── Users (Contacts) ─────────────────────────────────────────────────────
  //
  // InLoox contacts with IsIdentity=true are system users. The workspaceId
  // parameter is accepted for interface compliance but is not used in the query
  // (InLoox has no workspace-scoped contact endpoint).

  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const rows = await this.listCollection<RawInlooxContact>(
      credentials,
      '/Contact',
      params,
      'IsIdentity eq true',
    )
    return rows.map((c) => transformUser(c, workspaceId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<ODataSingle<RawInlooxContact>>(`/Contact(${id})`)
    if (!res.ContactId) throw new Error(`InLoox contact ${id} not found`)
    return transformUser(res)
  }
}

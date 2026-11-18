/**
 * Stackby adapter for the projects vertical.
 *
 * Stackby is a no-code spreadsheet/database platform. Its public API is
 * single-host SaaS at `https://stackby.com/api/betav1`, authenticated with
 * a long-lived API key via the `api-key` header. There is no OAuth2
 * authorization-code flow, so credentials are collected through the Connect
 * Link form (single API-key field via `simpleApiKey`).
 *
 * Canonical mapping (Stackby's hierarchy is Stack > Table > Row):
 *   - Projects  ← Stack+Table composite      synthetic; no list-stacks endpoint.
 *                 Canonical id = `{stackId}/{tableName}`.
 *   - Tasks     ← Rows                       GET /rowlist/{stackId}/{tableName}
 *
 * Comments, Tags, Workspaces, and Users are intentionally NOT implemented:
 * Stackby's public API exposes no endpoints for these resources, so those
 * methods are left off and auto-respond 501.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: comment    — Stackby public API has no row-comment endpoint; comments are UI-only.
 * Unavailable: tag        — Stackby has no tags concept or tags endpoint; labels are free-form column values.
 * Unavailable: user       — Stackby public API has no endpoint to list or retrieve workspace members.
 * Unavailable: workspace  — Stackby public API has no list-stacks/workspaces endpoint; stack ids must be supplied by caller.
 *
 * Webhooks are NOT implemented: Stackby has no documented inbound signed-
 * webhook API, so there is no webhook verification or parsing here.
 *
 * Pagination: row-list endpoints page via `offset` (0-based integer) and
 * `maxrecord` (page size). The caller increments `offset` by `maxrecord`
 * until an empty array is returned.
 */
import { simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'

import { buildAuthUrl, exchangeCode as stackbyExchange, refreshCredentials as stackbyRefresh } from './auth'
import { StackbyClient } from './client'
import { DEFAULT_PAGE_SIZE, TOKEN_HELP_URL } from './constants'

import { transformProject } from './transform/project'
import { transformTask, type RawStackbyRow } from './transform/task'

/** Connect Link form: a single Stackby API key. */
const CONNECT_FORM = simpleApiKey({
  label: 'API key',
  placeholder: 'your-stackby-api-key',
  helpText: `Generate an API key from your Stackby account settings. See ${TOKEN_HELP_URL}`,
})

/**
 * Split a composite project id (`{stackId}/{tableName}`) into its parts.
 * The table name may itself contain slashes; only the first slash is used as
 * the separator.
 */
function splitProjectId(id: string): { stackId: string; tableName: string } {
  const idx = id.indexOf('/')
  if (idx === -1) return { stackId: id, tableName: '' }
  return { stackId: id.slice(0, idx), tableName: id.slice(idx + 1) }
}

export class StackbyAdapter implements ProjectsAdapter {
  readonly platform = 'stackby'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return stackbyExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return stackbyRefresh(credentials)
  }

  private client(credentials: Credentials): StackbyClient {
    return new StackbyClient(credentials)
  }

  /**
   * Build Stackby row-list query params.
   * `offset` is a 0-based integer; `maxrecord` is the page size.
   * The `cursor` QueryParam carries the offset value.
   */
  private rowListParams(params: QueryParams): Record<string, unknown> {
    return {
      maxrecord: params.limit ?? DEFAULT_PAGE_SIZE,
      offset: params['cursor'] != null ? Number(params['cursor']) : 0,
    }
  }

  // ── Projects (Stack+Table synthetic) ─────────────────────────────────────
  //
  // Stackby exposes no endpoint to enumerate all stacks or tables. Callers
  // who already know the stackId/tableName can synthesise a Project via
  // getProject; listProjects always returns an empty array.

  async listProjects(_credentials: Credentials, _params: QueryParams): Promise<Project[]> {
    // No list-stacks endpoint — return empty; callers use getProject directly.
    return []
  }

  async getProject(_credentials: Credentials, id: string): Promise<Project> {
    // id must be in '{stackId}/{tableName}' form.
    const { stackId, tableName } = splitProjectId(id)
    if (!stackId || !tableName) {
      throw new Error(
        `Stackby project id must be in '{stackId}/{tableName}' form; got '${id}'.`,
      )
    }
    return transformProject({ stackId, tableName })
  }

  // ── Tasks (Rows) ──────────────────────────────────────────────────────────

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const { stackId, tableName } = splitProjectId(projectId)
    if (!stackId || !tableName) {
      throw new Error(
        `Stackby projectId must be in '{stackId}/{tableName}' form; got '${projectId}'.`,
      )
    }
    const rows = await this.client(credentials).get<RawStackbyRow[]>(
      `/rowlist/${stackId}/${encodeURIComponent(tableName)}`,
      this.rowListParams(params),
    )
    return (rows ?? []).map((r) => transformTask(r, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // Stackby has no single-row GET-by-id endpoint at betav1. We resolve by
    // using `rowIds` filter on the list endpoint. The canonical task id is the
    // `rowId`; the projectId (stackId/tableName) must be supplied via the
    // `project_id` query-param workaround stored in the id as
    // `{projectId}|{rowId}`.
    const pipeIdx = id.indexOf('|')
    if (pipeIdx === -1) {
      throw new Error(
        `Stackby task id must be in '{stackId}/{tableName}|{rowId}' form; got '${id}'.`,
      )
    }
    const projectId = id.slice(0, pipeIdx)
    const rowId = id.slice(pipeIdx + 1)
    const { stackId, tableName } = splitProjectId(projectId)
    if (!stackId || !tableName) {
      throw new Error(
        `Stackby task id must be in '{stackId}/{tableName}|{rowId}' form; got '${id}'.`,
      )
    }
    const rows = await this.client(credentials).get<RawStackbyRow[]>(
      `/rowlist/${stackId}/${encodeURIComponent(tableName)}`,
      { rowIds: rowId },
    )
    const row = (rows ?? []).find((r) => r.rowId === rowId)
    if (!row) throw new Error(`Stackby row ${rowId} not found in ${projectId}`)
    return transformTask(row, projectId)
  }
}

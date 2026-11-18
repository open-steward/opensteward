/**
 * Coda adapter for the projects vertical.
 *
 * Coda exposes a single-host REST API at `https://coda.io/apis/v1`,
 * authenticated with a long-lived API token in the `Authorization: Bearer`
 * header. There is no OAuth2 authorization-code flow for first-party API
 * access, so credentials are collected through the Connect Link form (a single
 * API-key field via `simpleApiKey`).
 *
 * Canonical mapping (Coda's hierarchy is Workspace > Folder > Doc > Table > Row):
 *   - Projects   ← docs        GET /docs, GET /docs/{docId}
 *   - Tasks      ← tables       GET /docs/{docId}/tables, GET /docs/{docId}/tables/{tableId}
 *                 (canonical task id is the composite `{docId}:{tableId}`)
 *   - Workspaces ← workspaces   derived from docs' `workspace` reference and
 *                 the active token's `/whoami` (Coda has no list-workspaces
 *                 endpoint)
 *   - Users      ← members      GET /workspaces/{workspaceId}/users, plus the
 *                 active token's identity via GET /whoami
 *
 * Comments and Tags are intentionally NOT implemented: Coda has no comment or
 * tag/label API, so those methods are left off and auto-respond 501. Coda also
 * exposes no inbound signed webhooks (its "webhook trigger" is an outbound
 * automation entry point), so there is no webhook verification/parsing here.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: comment — Coda API v1 exposes no comment/discussion endpoint.
 * Unavailable: tag     — Coda API v1 exposes no tag or label endpoint.
 *
 * Pagination: list endpoints return `{ items, nextPageToken, nextPageLink }`
 * and page via an opaque `pageToken` cursor. Coda's reference ("List
 * Endpoints", https://coda.io/developers/apis/v1): a `limit` above its
 * (undocumented, changeable) maximum returns only the maximum, and the
 * `nextPageToken` — not a full page — says whether more exist; parameters
 * sent alongside a `pageToken` are ignored. One upstream page is therefore
 * not reliably one caller page, so every list cuts the caller's rows out of
 * the token chain with `pageByRows`. No `maxPageSize` is declared: Coda
 * publishes none for these endpoints.
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
import type { CursorPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  exchangeCode as codaExchange,
  refreshCredentials as codaRefresh,
} from './auth'
import { CodaClient } from './client'
import { DEFAULT_PAGE_SIZE, TOKEN_HELP_URL } from './constants'

import { transformProject, type RawCodaDoc } from './transform/project'
import { transformTask, type RawCodaTable } from './transform/task'
import { transformWorkspace, type RawCodaWorkspace } from './transform/workspace'
import { transformUser, type RawCodaUser } from './transform/user'

/** Coda collection envelope: `{ items, nextPageToken, nextPageLink }`. */
interface ListResponse<T> {
  items?: T[]
  href?: string
  nextPageToken?: string
  nextPageLink?: string
}

/** `whoami` returns the active token's identity, including its workspace. */
interface WhoamiResponse extends RawCodaUser {
  workspace?: { id: string; name?: string }
}

/** Guard on the whole-collection doc walk behind listWorkspaces. */
const MAX_DOC_PAGES = 1_000

/**
 * Split a canonical composite id (`{docId}:{tableId}`) into its parts. Tasks
 * encode their doc id this way because Coda's per-table GET is path-scoped
 * under a doc. A bare id (no colon) is returned as `resourceId` with an empty
 * `docId`.
 */
function splitScopedId(id: string): { docId: string; resourceId: string } {
  const idx = id.indexOf(':')
  if (idx === -1) return { docId: '', resourceId: id }
  return { docId: id.slice(0, idx), resourceId: id.slice(idx + 1) }
}

/** Connect Link form: a single Coda API token. */
const CONNECT_FORM = simpleApiKey({
  label: 'API token',
  placeholder: '11111111-2222-3333-4444-555555555555',
  helpText: `Generate an API token from your Coda account settings. See ${TOKEN_HELP_URL}`,
})

export class CodaAdapter implements ProjectsAdapter {
  readonly platform = 'coda'
  readonly version = '0.1.0'

  // Connect Link support — single API-token form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return codaExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return codaRefresh(credentials)
  }

  private client(credentials: Credentials): CodaClient {
    return new CodaClient(credentials)
  }

  /** The caller's page size, which is also what we ask Coda for. */
  private pageLimit(params: QueryParams): number {
    const n = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_PAGE_SIZE
  }

  /** One Coda page: the first request carries `first`, a continuation only the token. */
  private async fetchPage<T>(
    client: CodaClient,
    path: string,
    first: Record<string, unknown>,
    token: string | undefined,
  ): Promise<CursorPage<T, string>> {
    const res = await client.get<ListResponse<T>>(path, token ? { pageToken: token } : first)
    return { items: res.items ?? [], next: res.nextPageToken || undefined }
  }

  /**
   * The caller's page of `path`. An explicit `cursor` is an upstream
   * position and is fetched as-is; otherwise `page`/`limit` are cut out of
   * the token chain, with `hasMore` exact.
   */
  private async listRows<T>(
    credentials: Credentials,
    path: string,
    first: Record<string, unknown>,
    params: QueryParams,
  ): Promise<T[]> {
    const client = this.client(credentials)
    if (params['cursor']) {
      const page = await this.fetchPage<T>(client, path, first, String(params['cursor']))
      reportUpstreamPage(params, { hasMore: page.next !== undefined })
      return page.items
    }
    const key = cursorPagerKey(connectionScope('coda', credentials), path, first)
    const page = await pageByRows<T, string>(
      key,
      params,
      (token) => this.fetchPage<T>(client, path, first, token),
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return page.items
  }

  // ── Projects (docs) ──────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const workspaceId = params['workspace_id']
    const folderId = params['folder_id']
    const rows = await this.listRows<RawCodaDoc>(
      credentials,
      '/docs',
      {
        limit: this.pageLimit(params),
        ...(workspaceId ? { workspaceId: String(workspaceId) } : {}),
        ...(folderId ? { folderId: String(folderId) } : {}),
      },
      params,
    )
    return rows.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<RawCodaDoc>(`/docs/${id}`)
    if (!res || res.id == null) throw new Error(`Coda doc ${id} not found`)
    return transformProject(res)
  }

  // ── Tasks (tables) ───────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const rows = await this.listRows<RawCodaTable>(
      credentials,
      `/docs/${projectId}/tables`,
      { limit: this.pageLimit(params) },
      params,
    )
    return rows.map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // Coda's per-table GET is path-scoped under its doc and there is no global
    // table-by-id endpoint, so the canonical id is the composite
    // `{docId}:{tableId}` emitted by `transformTask`.
    const { docId, resourceId } = splitScopedId(id)
    if (!docId) {
      throw new Error(`Coda task id must be in '{docId}:{tableId}' form; got '${id}'.`)
    }
    const res = await this.client(credentials).get<RawCodaTable>(
      `/docs/${docId}/tables/${resourceId}`,
    )
    if (!res || res.id == null) throw new Error(`Coda table ${id} not found`)
    return transformTask(res, docId)
  }

  // ── Workspaces ─────────────────────────────────────────────────────────────
  //
  // Coda has no list-workspaces endpoint. Workspaces are surfaced as the
  // `workspace` reference on each doc, deduped by id; the active token's
  // workspace comes from `/whoami`.

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const client = this.client(credentials)
    const byId = new Map<string, RawCodaWorkspace>()

    const me = await client.get<WhoamiResponse>('/whoami')
    if (me?.workspace?.id) byId.set(me.workspace.id, me.workspace)

    // The collection is derived from EVERY doc, so walk the whole doc chain
    // and page the deduped workspaces locally. A chain longer than the guard,
    // or a token that names itself, throws rather than serving a partial
    // collection as complete.
    let token: string | undefined
    for (let pages = 0; ; pages++) {
      if (pages >= MAX_DOC_PAGES) {
        throw new Error(`Coda /docs chain exceeded ${MAX_DOC_PAGES} pages while listing workspaces`)
      }
      const page = await this.fetchPage<RawCodaDoc>(
        client,
        '/docs',
        { limit: DEFAULT_PAGE_SIZE },
        token,
      )
      for (const doc of page.items) {
        const ws = doc.workspace
        if (ws?.id && !byId.has(ws.id)) byId.set(ws.id, ws)
      }
      if (page.next == null) break
      if (page.next === token) {
        throw new Error('Coda /docs repeated its pageToken while listing workspaces')
      }
      token = page.next
    }
    return pageLocally([...byId.values()].map(transformWorkspace), params)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const client = this.client(credentials)

    const me = await client.get<WhoamiResponse>('/whoami')
    if (me?.workspace?.id === id) return transformWorkspace(me.workspace)

    // Fall back to scanning docs for a matching workspace reference.
    const docs = await client.get<ListResponse<RawCodaDoc>>('/docs', { limit: DEFAULT_PAGE_SIZE })
    const found = (docs.items ?? []).map((d) => d.workspace).find((w) => w?.id === id)
    if (!found) throw new Error(`Coda workspace ${id} not found`)
    return transformWorkspace(found)
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  //
  // `/workspaces/{workspaceId}/users` lists workspace members (each keyed by
  // login email). `getUser` resolves the active token's identity via
  // `/whoami`; per-member GET-by-id is not exposed by Coda.

  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    // The endpoint documents only `pageToken` (and a roles filter): no `limit`.
    const rows = await this.listRows<RawCodaUser>(
      credentials,
      `/workspaces/${workspaceId}/users`,
      {},
      params,
    )
    return rows.map((u) => transformUser(u, workspaceId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    // Coda has no per-user GET-by-id; the only directly fetchable identity is
    // the active token's own user via `/whoami`.
    const me = await this.client(credentials).get<WhoamiResponse>('/whoami')
    const meId = me?.loginId ?? me?.email
    if (!me || (meId !== id && id !== '')) {
      throw new Error(`Coda user ${id} not found`)
    }
    return transformUser(me, me.workspace?.id)
  }
}

export { DEFAULT_PAGE_SIZE }

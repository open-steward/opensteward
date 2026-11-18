/**
 * Tuleap adapter for the projects vertical.
 *
 * Tuleap is a self-hosted open-source ALM / project management platform.
 * Its REST API lives at `{instance}/api/` and is authenticated with a
 * personal access key in the `X-Auth-AccessKey` header.
 * The instance base URL is stored in `credentials.extra.host`.
 *
 * Supported canonical resources:
 *   - Projects    GET /api/projects, GET /api/projects/{id}
 *   - Tasks       GET /api/projects/{id}/trackers → GET /api/trackers/{id}/artifacts
 *                 GET /api/artifacts/{id}
 *   - Comments    GET /api/artifacts/{id}/changesets (changesets with a non-empty
 *                 last_comment.body are surfaced as comments)
 *   - Users       GET /api/users/{id}
 *
 * NOT implemented (Tuleap does not have these concepts at the REST level):
 *   - Tags        — no platform-level tag resource
 *   - Workspaces  — projects are top-level; no workspace abstraction
 *
 * Webhooks: Tuleap core does not document a signed-webhook signature header,
 * so verifyWebhook / parseWebhookEvents are not implemented.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: tag       — no platform-level tag or label resource in the Tuleap REST API
// Unavailable: workspace — projects are the top-level unit; no workspace abstraction exists

import {
  connectionScope,
  cursorPagerKey,
  customForm,
  pageByRows,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  exchangeCode as tuleapExchange,
  refreshCredentials as tuleapRefresh,
} from './auth'
import { TuleapClient } from './client'
import {
  API_KEY_HELP_URL,
  CHANGESETS_MAX_LIMIT,
  DEFAULT_HOST,
  DEFAULT_PAGE_SIZE,
  PROJECTS_MAX_LIMIT,
} from './constants'

import { transformProject, type RawTuleapProject } from './transform/project'
import { transformArtifact, type RawTuleapArtifact } from './transform/task'
import { transformChangeset, type RawTuleapChangeset } from './transform/comment'
import { transformUser, type RawTuleapUser } from './transform/user'

// ── Connect Link form ─────────────────────────────────────────────────────

/**
 * Two-field form: the personal access key + optional self-hosted instance URL.
 * The URL is stored in `credentials.extra.host`; the key in `accessToken`.
 */
const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'Personal access key',
      type: 'password',
      required: true,
      helpText: `Generate a personal access key at your Tuleap instance under Profile → Keys/Tokens. See ${API_KEY_HELP_URL}`,
    },
    {
      name: 'host',
      label: 'Instance URL',
      type: 'text',
      required: false,
      placeholder: DEFAULT_HOST,
      helpText: 'Base URL of your Tuleap instance, e.g. https://tuleap.example.com',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('Personal access key is required.')
    const host = (fields['host'] ?? '').trim() || DEFAULT_HOST
    return { accessToken: apiKey, extra: { host } }
  },
})

// ── Tracker listing helper ─────────────────────────────────────────────────

interface RawTuleapTracker {
  id: number
  label?: string
  item_name?: string
  uri?: string
  project?: { id?: number }
}

export class TuleapAdapter implements ProjectsAdapter {
  readonly platform = 'tuleap'
  readonly version = '0.1.0'

  // Connect Link support — API-key + optional instance URL form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return tuleapExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return tuleapRefresh(credentials)
  }

  private client(credentials: Credentials): TuleapClient {
    return new TuleapClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    const offset = params['cursor'] ? Number(params['cursor']) : 0
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      offset: Number.isFinite(offset) && offset >= 0 ? offset : 0,
    }
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  // GET /projects pages by `limit` (maximum 50) + `offset`. A page can be
  // short or empty when permissions hide rows, so the end comes from
  // `x-pagination-size` (an upper bound on the matching rows, so it is not
  // reported as a total), never from the page length.
  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const size = Math.max(1, Math.min(params.limit ?? PROJECTS_MAX_LIMIT, PROJECTS_MAX_LIMIT))
    const cursor = params['cursor'] ? Number(params['cursor']) : NaN
    const offset = Number.isFinite(cursor) && cursor >= 0 ? cursor : pageOffset(params, size)
    const { rows, size: total } = await this.client(credentials).getPage<RawTuleapProject>(
      '/projects',
      { limit: size, offset },
    )
    reportUpstreamPage(params, {
      ...(total !== undefined ? { hasMore: offset + size < total } : {}),
      ...(params.limit !== undefined && size < params.limit ? { pageSize: size } : {}),
    })
    return rows.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<RawTuleapProject>(`/projects/${id}`)
    if (!res) throw new Error(`Tuleap project ${id} not found`)
    return transformProject(res)
  }

  // ── Tasks (artifacts) ────────────────────────────────────────────────────
  //
  // Tuleap artifacts live inside trackers, which live inside projects.
  // listTasks fetches all trackers for the project, then all artifacts
  // from each tracker and flattens them.

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const client = this.client(credentials)
    // 1. Get trackers for the project (small list — use limit=50)
    const trackers = await client.get<RawTuleapTracker[]>(`/projects/${projectId}/trackers`, {
      limit: 50,
      offset: 0,
    })
    if (!trackers || trackers.length === 0) return []

    // 2. For each tracker fetch artifacts (honour the caller's page params)
    const pp = this.pageParams(params)
    const results: Task[] = []
    for (const tracker of trackers) {
      const artifacts = await client.get<RawTuleapArtifact[]>(
        `/trackers/${tracker.id}/artifacts`,
        { ...pp },
      )
      for (const a of artifacts ?? []) {
        results.push(transformArtifact(a, projectId))
      }
    }
    return results
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<RawTuleapArtifact>(`/artifacts/${id}`)
    if (!res) throw new Error(`Tuleap artifact ${id} not found`)
    return transformArtifact(res)
  }

  // ── Comments (changesets) ────────────────────────────────────────────────
  //
  // Tuleap does not have a standalone comment endpoint. Comments are embedded
  // in changeset objects. Only changesets with a non-empty `last_comment.body`
  // are surfaced.

  //
  // Changesets page by `limit` (maximum 50) + `offset`, and only those with a
  // comment become rows, so one upstream page is not one caller page: the row
  // pager walks full 50-changeset pages and cuts the caller's rows from them.
  // The next page exists while `offset + 50 < x-pagination-size`; an upstream
  // page emptied by permissions does not end the walk.

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const client = this.client(credentials)
    const host =
      (typeof credentials.extra?.['host'] === 'string' ? credentials.extra['host'] : '') ||
      DEFAULT_HOST
    const key = cursorPagerKey(connectionScope(host, credentials), 'changesets', {
      artifact: taskId,
      limit: CHANGESETS_MAX_LIMIT,
    })
    const { items } = await pageByRows<Comment, number>(key, params, async (cursor) => {
      const offset = cursor ?? 0
      const { rows, size: total } = await client.getPage<RawTuleapChangeset>(
        `/artifacts/${taskId}/changesets`,
        { limit: CHANGESETS_MAX_LIMIT, offset },
      )
      const next = offset + CHANGESETS_MAX_LIMIT
      const more = total !== undefined ? next < total : rows.length >= CHANGESETS_MAX_LIMIT
      return {
        items: rows
          .filter(
            (c) =>
              (c.last_comment?.body && c.last_comment.body.trim().length > 0) ||
              (c.last_comment?.post_processed_body &&
                c.last_comment.post_processed_body.trim().length > 0),
          )
          .map((c) => transformChangeset(c, taskId)),
        next: more ? next : null,
      }
    })
    return items
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // Tuleap has no standalone changeset-by-id endpoint at the public REST level.
    // id is encoded as `{artifactId}:{changesetId}` (colon-separated).
    const [artifactId, changesetId] = id.split(':')
    if (!artifactId || !changesetId) {
      throw new Error(
        `Tuleap comment id must be "{artifactId}:{changesetId}", got "${id}"`,
      )
    }
    const changesets = await this.client(credentials).get<RawTuleapChangeset[]>(
      `/artifacts/${artifactId}/changesets`,
      { limit: DEFAULT_PAGE_SIZE, offset: 0 },
    )
    const changeset = (changesets ?? []).find((c) => String(c.id) === changesetId)
    if (!changeset) throw new Error(`Tuleap changeset ${id} not found`)
    return transformChangeset(changeset, artifactId)
  }

  // ── Users ────────────────────────────────────────────────────────────────
  //
  // Tuleap does not expose a paginated user-list endpoint in the public REST
  // API (it exists but requires admin). getUser is fully supported.

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawTuleapUser>(`/users/${id}`)
    if (!res) throw new Error(`Tuleap user ${id} not found`)
    return transformUser(res)
  }
}

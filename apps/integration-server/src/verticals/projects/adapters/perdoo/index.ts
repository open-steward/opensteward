/**
 * Perdoo adapter for the projects vertical.
 *
 * Perdoo is an OKR & strategy-execution platform. Its API is GraphQL-only,
 * hosted at https://api-eu.perdoo.com/graphql/. Authentication is a
 * long-lived bearer token from Personal Settings → Integrations (no OAuth2),
 * so credentials are collected through the Connect Link form (`simpleApiKey`).
 *
 * Canonical resource mapping:
 *   Objective  → Project    (top-level OKR goal)
 *   KeyResult  → Task       (measurable result / initiative under an objective)
 *   Group      → Workspace  (Perdoo team/department — no true workspace concept)
 *   User       → User       (allUsers query; account-wide)
 *
 * Intentionally NOT implemented (auto-respond 501):
 *   Comments — Perdoo has no comment/discussion concept in its API.
 *   Tags     — tags exist on objectives/key-results but are not a standalone
 *               listable resource via the GraphQL API.
 *   Webhooks — Perdoo documents no signed webhook delivery.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: comment — Perdoo has no comment or discussion concept in its GraphQL API.
// Unavailable: tag     — tags are embedded fields on objectives/key-results, not a standalone listable resource via the GraphQL API.
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import { buildAuthUrl, exchangeCode as perdooExchange, refreshCredentials as perdooRefresh } from './auth'
import { PerdooClient } from './client'
import { DEFAULT_PAGE_SIZE, TOKEN_HELP_URL } from './constants'

import { transformProject, type RawPerdooObjective } from './transform/project'
import { transformTask, type RawPerdooKeyResult } from './transform/task'
import { transformWorkspace, type RawPerdooGroup } from './transform/workspace'
import { transformUser, type RawPerdooUser } from './transform/user'

// ── GraphQL query strings ──────────────────────────────────────────────────────

const OBJECTIVES_QUERY = `
  query ListObjectives(
    $first: Int,
    $after: String,
    $groups_Id: UUID
  ) {
    objectives(
      first: $first,
      after: $after,
      groups_Id: $groups_Id
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id name description progress status stage
          lead { id name }
          timeframe { id name }
          parent { id name }
          groups { edges { node { id name } } }
          startDate dueDate createdDate lastEditedDate
        }
      }
    }
  }
`

const OBJECTIVE_QUERY = `
  query GetObjective($id: UUID!) {
    objective(id: $id) {
      id name description progress status stage
      lead { id name }
      timeframe { id name }
      parent { id name }
      groups { edges { node { id name } } }
      startDate dueDate createdDate lastEditedDate
    }
  }
`

const KEY_RESULTS_QUERY = `
  query ListKeyResults(
    $first: Int,
    $after: String,
    $objective: UUID
  ) {
    keyResults(
      first: $first,
      after: $after,
      objective: $objective
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id name description status type archived
          lead { id }
          objective { id name }
          parent { id name }
          contributors { edges { node { id } } }
          childrenCount
          startValue endValue currentValue metricUnit weight
          startDate dueDate createdDate lastEditedDate
        }
      }
    }
  }
`

const KEY_RESULT_QUERY = `
  query GetKeyResult($id: UUID!) {
    keyResult(id: $id) {
      id name description status type archived
      lead { id }
      objective { id name }
      parent { id name }
      contributors { edges { node { id } } }
      childrenCount
      startValue endValue currentValue metricUnit weight
      startDate dueDate createdDate lastEditedDate
    }
  }
`

const GROUPS_QUERY = `
  query ListGroups($first: Int, $after: String) {
    allGroups(first: $first, after: $after, orderBy: "name") {
      pageInfo { hasNextPage endCursor }
      edges { node { id name } }
    }
  }
`

const GROUP_QUERY = `
  query GetGroup($id: UUID!) {
    group(id: $id) {
      id name
    }
  }
`

const USERS_QUERY = `
  query ListUsers($first: Int, $after: String) {
    allUsers(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { id name email role isActive } }
    }
  }
`

const USER_QUERY = `
  query GetUser($id: UUID!) {
    user(id: $id) {
      id name email role isActive
    }
  }
`

// ── Relay connection helpers ───────────────────────────────────────────────────

interface PageInfo {
  hasNextPage: boolean
  endCursor?: string | null
}

interface RelayConnection<T> {
  pageInfo: PageInfo
  edges: Array<{ node: T }>
}

function extractNodes<T>(conn: RelayConnection<T> | undefined | null): T[] {
  return (conn?.edges ?? []).map((e) => e.node)
}

// ── Connect Link form ──────────────────────────────────────────────────────────

const CONNECT_FORM = simpleApiKey({
  label: 'API bearer token',
  placeholder: 'Enter your Perdoo API token',
  helpText: `Generate a token from Personal Settings → Integrations in Perdoo. See ${TOKEN_HELP_URL}`,
})

// ── Adapter ───────────────────────────────────────────────────────────────────

export class PerdooAdapter implements ProjectsAdapter {
  readonly platform = 'perdoo'
  readonly version = '0.1.0'

  // Connect Link support — single API token form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return perdooExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return perdooRefresh(credentials)
  }

  private client(credentials: Credentials): PerdooClient {
    return new PerdooClient(credentials)
  }

  /**
   * One caller page of a Relay connection field.
   *
   * Every Perdoo list field takes `first` / `after` and returns `pageInfo`
   * ("hasNextPage: When paginating forwards, are there more items?",
   * "endCursor: When paginating forwards, the cursor to continue."). The
   * schema documents no maximum for `first`, so the caller's limit is sent
   * as-is. An explicit `cursor` param names the upstream page directly;
   * otherwise the 1-based `page` is resolved by walking `endCursor` forward,
   * one upstream page per caller page, keyed per connection, field, filters
   * and page size.
   */
  private async listConnection<T>(
    credentials: Credentials,
    query: string,
    field: string,
    filters: Record<string, unknown>,
    params: QueryParams,
  ): Promise<T[]> {
    const client = this.client(credentials)
    const asked = Number(params.limit)
    const first = Number.isFinite(asked) && asked >= 1 ? Math.floor(asked) : DEFAULT_PAGE_SIZE
    const fetchPage = async (after: string | undefined) => {
      const res = await client.query<Record<string, RelayConnection<T> | undefined>>(query, {
        ...filters,
        first,
        ...(after !== undefined ? { after } : {}),
      })
      const conn = res[field]
      const items = extractNodes(conn)
      const end = conn?.pageInfo?.endCursor
      // An empty page is the end, whatever pageInfo says alongside it.
      const next = items.length > 0 && conn?.pageInfo?.hasNextPage && end ? end : null
      return { items, next }
    }
    const explicit = params['cursor']
    let result: { items: T[]; hasMore: boolean }
    if (typeof explicit === 'string' && explicit.length > 0) {
      const res = await fetchPage(explicit)
      result = { items: res.items, hasMore: res.next !== null }
    } else {
      const key = cursorPagerKey(connectionScope('perdoo', credentials), field, {
        ...filters,
        limit: first,
      })
      result = await pageByCursor<T>(key, params.page, fetchPage)
    }
    reportUpstreamPage(params, { hasMore: result.hasMore })
    return result.items
  }

  // ── Projects (Objectives) ──────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const filters: Record<string, unknown> = {}
    if (params['workspace_id']) filters['groups_Id'] = String(params['workspace_id'])
    const nodes = await this.listConnection<RawPerdooObjective>(
      credentials,
      OBJECTIVES_QUERY,
      'objectives',
      filters,
      params,
    )
    return nodes.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).query<{
      objective: RawPerdooObjective | null
    }>(OBJECTIVE_QUERY, { id })
    if (!res.objective) throw new Error(`Perdoo objective ${id} not found`)
    return transformProject(res.objective)
  }

  // ── Tasks (KeyResults / Initiatives) ──────────────────────────────────────

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const nodes = await this.listConnection<RawPerdooKeyResult>(
      credentials,
      KEY_RESULTS_QUERY,
      'keyResults',
      { objective: projectId },
      params,
    )
    return nodes.map((kr) => transformTask(kr, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).query<{
      keyResult: RawPerdooKeyResult | null
    }>(KEY_RESULT_QUERY, { id })
    if (!res.keyResult) throw new Error(`Perdoo key result ${id} not found`)
    return transformTask(res.keyResult)
  }

  // ── Workspaces (Groups) ────────────────────────────────────────────────────

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const nodes = await this.listConnection<RawPerdooGroup>(
      credentials,
      GROUPS_QUERY,
      'allGroups',
      {},
      params,
    )
    return nodes.map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).query<{
      group: RawPerdooGroup | null
    }>(GROUP_QUERY, { id })
    if (!res.group) throw new Error(`Perdoo group ${id} not found`)
    return transformWorkspace(res.group)
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, _workspaceId: string, params: QueryParams): Promise<User[]> {
    const nodes = await this.listConnection<RawPerdooUser>(
      credentials,
      USERS_QUERY,
      'allUsers',
      {},
      params,
    )
    return nodes.map((u) => transformUser(u))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).query<{
      user: RawPerdooUser | null
    }>(USER_QUERY, { id })
    if (!res.user) throw new Error(`Perdoo user ${id} not found`)
    return transformUser(res.user)
  }
}

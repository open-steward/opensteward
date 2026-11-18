/**
 * ZenHub adapter for the projects vertical.
 *
 * ZenHub is a GitHub-native project management tool that exposes a public
 * GraphQL API at `https://api.zenhub.com/public/graphql`. Authentication is
 * done with a Personal API Key (generated in the ZenHub Dashboard) sent as
 * `Authorization: Bearer <key>`. There is no OAuth2 authorization-code flow
 * for first-party API access, so credentials are collected through the Connect
 * Link form (single API-key field via `simpleApiKey`).
 *
 * Canonical mapping (ZenHub hierarchy: Workspace > Repository > Pipeline > Issue):
 *   - Workspaces  ← workspaces      viewer.zenhubOrganizations → workspaces / workspace(id)
 *   - Projects    ← repositories    workspace.repositoriesConnection
 *   - Tasks       ← issues          searchIssuesByPipeline / node(...on Sprint)
 *   - Tags        ← labels          repository labels (embedded on issues)
 *   - Users       ← workspace.zenhubUsers / node(id) on ZenhubUser
 *
 * Comments are `Issue.comments` (a CommentConnection) on an issue node.
 *
 * Schema: https://developers.zenhub.com/schema/zenhub-public-api.graphql (the
 * SDL the docs Explorer loads without a key).
 *
 * ZenHub has no publicly documented inbound webhook signature — webhook
 * verification is NOT implemented and there is no webhook.ts.
 *
 * Pagination: Relay cursor model — `first` / `after` / `pageInfo.endCursor`.
 *
 * Docs: https://developers.zenhub.com/graphql-api-docs/getting-started/
 */
import {
  simpleApiKey,
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  exchangeCode as zenhubExchange,
  refreshCredentials as zenhubRefresh,
} from './auth'
import { ZenhubClient, type GqlResponse } from './client'
import { DEFAULT_PAGE_SIZE, TOKEN_HELP_URL } from './constants'

import { transformProject, type RawZenhubRepository } from './transform/project'
import { transformTask, type RawZenhubIssue } from './transform/task'
import { transformComment, type RawZenhubComment } from './transform/comment'
import { transformTag, type RawZenhubLabel } from './transform/tag'
import { transformWorkspace, type RawZenhubWorkspace } from './transform/workspace'
import { transformUser, type RawZenhubUser } from './transform/user'

// ── GraphQL response envelopes ──────────────────────────────────────────────

interface PageInfo {
  hasNextPage: boolean
  endCursor?: string | null
}

interface Connection<T> {
  nodes?: T[]
  pageInfo?: PageInfo
}

interface OrganizationWorkspacesData {
  viewer?: {
    zenhubOrganizations?: Connection<{
      id: string
      workspaces?: Connection<RawZenhubWorkspace>
    }>
  }
}

interface WorkspaceByIdData {
  workspace?: RawZenhubWorkspace | null
}

interface WorkspaceUsersData {
  workspace?: { id: string; zenhubUsers?: Connection<RawZenhubUser> } | null
}

interface IssueCommentsData {
  node?: { id?: string; comments?: Connection<RawZenhubComment> } | null
}

interface UserNodeData {
  node?: RawZenhubUser | Record<string, never> | null
}

interface WorkspaceData {
  workspace?: RawZenhubWorkspace & {
    repositoriesConnection?: Connection<RawZenhubRepository>
  }
}

interface SearchIssuesData {
  searchIssuesByPipeline?: Connection<RawZenhubIssue>
}

interface IssueNodeData {
  node?: RawZenhubIssue
}

interface RepositoryNodeData {
  node?: RawZenhubRepository & {
    labels?: Connection<RawZenhubLabel>
  }
}

// ── GraphQL query strings ───────────────────────────────────────────────────

// Workspaces are listed per organization: `ZenhubUser.zenhubOrganizations`
// then `ZenhubOrganization.workspaces`, whose `query` filter is optional
// (`query: String`) and is left out. Organizations are walked one per request
// (`first: 1`), so one request is one upstream page of one organization's
// workspaces and its cursor is the pair of `after` positions.
const Q_ORGANIZATION_WORKSPACES = `
  query OrganizationWorkspaces($orgsAfter: String, $first: Int!, $after: String) {
    viewer {
      zenhubOrganizations(first: 1, after: $orgsAfter) {
        nodes {
          id
          workspaces(first: $first, after: $after) {
            nodes {
              id
              name
              displayName
              description
            }
            pageInfo { hasNextPage endCursor }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`

const Q_WORKSPACE_BY_ID = `
  query WorkspaceById($id: ID!) {
    workspace(id: $id) {
      id
      name
      displayName
      description
    }
  }
`

const Q_WORKSPACE = `
  query Workspace($id: ID!, $first: Int!, $after: String) {
    workspace(id: $id) {
      id
      name
      description
      repositoriesConnection(first: $first, after: $after) {
        nodes {
          id
          ghId
          name
          fullPath: name
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`

const Q_ISSUES_BY_PIPELINE = `
  query IssuesByPipeline($pipelineId: ID!, $first: Int!, $after: String) {
    searchIssuesByPipeline(pipelineId: $pipelineId, filters: {}, first: $first, after: $after) {
      nodes {
        id
        number
        title
        body
        state
        pullRequest
        type
        createdAt
        updatedAt
        closedAt
        ghId
        ghNodeId
        assignees { nodes { id login name } }
        labels { nodes { id name color } }
        estimate { value }
        pipelineIssue {
          pipeline { id name }
          priority
        }
        repository { id ghId name }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

const Q_PIPELINES_FOR_WORKSPACE = `
  query PipelinesForWorkspace($workspaceId: ID!) {
    workspace(id: $workspaceId) {
      pipelinesConnection(first: 100) {
        nodes { id name }
      }
    }
  }
`

const Q_ISSUE_NODE = `
  query IssueNode($id: ID!) {
    node(id: $id) {
      ... on Issue {
        id
        number
        title
        body
        state
        pullRequest
        type
        createdAt
        updatedAt
        closedAt
        ghId
        ghNodeId
        assignees { nodes { id login name } }
        labels { nodes { id name color } }
        estimate { value }
        pipelineIssue {
          pipeline { id name }
          priority
        }
        repository { id ghId name }
      }
    }
  }
`

const Q_ISSUE_COMMENTS = `
  query IssueComments($id: ID!, $first: Int!, $after: String) {
    node(id: $id) {
      ... on Issue {
        id
        comments(first: $first, after: $after) {
          nodes {
            id
            body
            createdAt
            updatedAt
            lastEditedAt
            author { id }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`

const Q_REPOSITORY_LABELS = `
  query RepositoryLabels($id: ID!, $first: Int!, $after: String) {
    node(id: $id) {
      ... on Repository {
        id
        ghId
        name
        labels(first: $first, after: $after) {
          nodes { id name color }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`

const Q_WORKSPACE_USERS = `
  query WorkspaceUsers($id: ID!, $first: Int!, $after: String) {
    workspace(id: $id) {
      id
      zenhubUsers(first: $first, after: $after) {
        nodes {
          id
          name
          email
          githubUser { login }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`

const Q_USER_NODE = `
  query UserNode($id: ID!) {
    node(id: $id) {
      ... on ZenhubUser {
        id
        name
        email
        githubUser { login }
      }
    }
  }
`

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Position in the organization → workspaces walk: both Relay `after` values. */
interface OrgWorkspacesCursor {
  orgsAfter: string | null
  after: string | null
}

/** ZenHub answers GraphQL errors with HTTP 200 and an `errors` array. */
function gqlData<T>(res: GqlResponse<T>): T {
  if (res.errors && res.errors.length > 0) {
    throw new Error(`ZenHub GraphQL error: ${res.errors.map((e) => e.message).join('; ')}`)
  }
  if (!res.data) throw new Error('ZenHub GraphQL response has no data')
  return res.data
}

function requireCursor(cursor: string | null | undefined, connection: string): string {
  if (!cursor) throw new Error(`ZenHub ${connection}: hasNextPage without an endCursor`)
  return cursor
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

// ── Connect Link form ────────────────────────────────────────────────────────

const CONNECT_FORM = simpleApiKey({
  label: 'Personal API Key',
  placeholder: 'zhp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  helpText: `Generate a Personal API Key from the ZenHub Dashboard (API section). See ${TOKEN_HELP_URL}`,
})

// ── Adapter ─────────────────────────────────────────────────────────────────

export class ZenhubAdapter implements ProjectsAdapter {
  readonly platform = 'zenhub'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return zenhubExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return zenhubRefresh(credentials)
  }

  private client(credentials: Credentials): ZenhubClient {
    return new ZenhubClient(credentials)
  }

  private pageSize(params: QueryParams): number {
    const l = params.limit
    if (typeof l === 'number' && l > 0) return Math.min(l, DEFAULT_PAGE_SIZE)
    return DEFAULT_PAGE_SIZE
  }

  /**
   * One caller page of a Relay connection
   * (https://developers.zenhub.com/graphql-api-docs/pagination): `first` is
   * the caller's limit clamped to the documented maximum of 100, and page N+1
   * is fetched with `after` = page N's `pageInfo.endCursor` while
   * `pageInfo.hasNextPage` is true. An explicit `params.cursor` names the
   * upstream page directly. `fetchConnection` returns null when the parent
   * object does not exist.
   */
  private async relayPage<R>(
    credentials: Credentials,
    collection: string,
    params: QueryParams,
    fetchConnection: (first: number, after: string | undefined) => Promise<Connection<R> | null>,
  ): Promise<R[]> {
    const first = this.pageSize(params)
    const fetchPage = async (after: string | undefined) => {
      const conn = await fetchConnection(first, after)
      if (!conn) throw notFound(`ZenHub ${collection} not found`)
      const info = conn.pageInfo
      if (info?.hasNextPage && !info.endCursor) {
        throw new Error(`ZenHub ${collection}: hasNextPage without an endCursor`)
      }
      return { items: conn.nodes ?? [], next: info?.hasNextPage ? (info.endCursor ?? null) : null }
    }
    const explicit = params['cursor'] ? String(params['cursor']) : undefined
    let result: { items: R[]; hasMore: boolean }
    if (explicit !== undefined) {
      const res = await fetchPage(explicit)
      result = { items: res.items, hasMore: res.next !== null }
    } else {
      const key = cursorPagerKey(connectionScope('zenhub', credentials), collection, {
        limit: first,
      })
      result = await pageByCursor<R>(key, params.page, fetchPage)
    }
    const clamped = typeof params.limit === 'number' && params.limit > first
    reportUpstreamPage(params, { hasMore: result.hasMore, ...(clamped ? { pageSize: first } : {}) })
    return result.items
  }

  // ── Workspaces ─────────────────────────────────────────────────────────────
  //
  // The schema has no top-level workspace list. Every Workspace belongs to one
  // organization (`Workspace.zenhubOrganization: ZenhubOrganization!`), and
  // `ZenhubUser.zenhubOrganizations` → `ZenhubOrganization.workspaces` are
  // both Relay connections, so the viewer's workspaces are the flattened walk
  // of every organization's workspaces. One request reads one organization
  // (`first: 1`) and one page of its workspaces (`first: 100`, the documented
  // maximum); pageByRows cuts the caller's rows out of that stream, whatever
  // the caller's limit.

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const client = this.client(credentials)
    const first = DEFAULT_PAGE_SIZE
    const key = cursorPagerKey(connectionScope('zenhub', credentials), 'organization-workspaces', {
      first,
    })
    const result = await pageByRows<RawZenhubWorkspace, OrgWorkspacesCursor>(
      key,
      params,
      async (cursor) => {
        const orgsAfter = cursor?.orgsAfter ?? null
        const res = await client.query<OrganizationWorkspacesData>(Q_ORGANIZATION_WORKSPACES, {
          orgsAfter,
          first,
          after: cursor?.after ?? null,
        })
        const orgs = gqlData(res).viewer?.zenhubOrganizations
        if (!orgs)
          throw new Error('ZenHub listWorkspaces: response has no viewer.zenhubOrganizations')
        const nextOrg: OrgWorkspacesCursor | null = orgs.pageInfo?.hasNextPage
          ? {
              orgsAfter: requireCursor(orgs.pageInfo.endCursor, 'zenhubOrganizations'),
              after: null,
            }
          : null
        const org = orgs.nodes?.[0]
        if (!org) return { items: [], next: nextOrg }
        const ws = org.workspaces
        if (!ws)
          throw new Error(
            `ZenHub listWorkspaces: organization ${org.id} has no workspaces connection`,
          )
        if (ws.pageInfo?.hasNextPage) {
          return {
            items: ws.nodes ?? [],
            next: { orgsAfter, after: requireCursor(ws.pageInfo.endCursor, 'workspaces') },
          }
        }
        return { items: ws.nodes ?? [], next: nextOrg }
      },
    )
    return result.items.map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).query<WorkspaceByIdData>(Q_WORKSPACE_BY_ID, { id })
    const ws = gqlData(res).workspace
    if (!ws) throw notFound(`ZenHub workspace ${id} not found`)
    return transformWorkspace(ws)
  }

  // ── Projects (repositories) ───────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const workspaceId = params['workspace_id']
    if (!workspaceId) throw new Error('ZenHub listProjects requires params.workspace_id')
    const first = this.pageSize(params)
    const after = params['cursor'] ? String(params['cursor']) : undefined
    const res = await this.client(credentials).query<WorkspaceData>(Q_WORKSPACE, {
      id: workspaceId,
      first,
      ...(after ? { after } : {}),
    })
    const nodes = res.data?.workspace?.repositoriesConnection?.nodes ?? []
    return nodes.map((r) => transformProject(r, String(workspaceId)))
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    // ZenHub has no standalone getRepository-by-id; fetch via workspace listing.
    // Callers embed workspaceId in the id as "workspaceId:repoId" if needed.
    // For a bare id we try a node query but repository nodes aren't guaranteed.
    // Best effort: reconstruct from label query (which needs a repo node).
    const res = await this.client(credentials).query<RepositoryNodeData>(Q_REPOSITORY_LABELS, {
      id,
      first: 1,
    })
    const node = res.data?.node
    if (!node) throw new Error(`ZenHub repository ${id} not found`)
    return transformProject(node)
  }

  // ── Tasks (issues) ────────────────────────────────────────────────────────
  //
  // ZenHub requires issuing per-pipeline queries. We fetch all pipelines for
  // the given projectId (repository's workspace) and union the results.
  // `projectId` here is the ZenHub repository id; we look up its workspace via
  // the node query which surfaces the workspace id in the pipeline info.

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const first = this.pageSize(params)
    const after = params['cursor'] ? String(params['cursor']) : undefined

    const workspaceId = params['workspace_id'] ? String(params['workspace_id']) : undefined

    if (!workspaceId) {
      // Without workspaceId we cannot look up pipelines — return empty rather
      // than throw, matching the "transforms never throw" convention.
      return []
    }

    // Get pipelines for the workspace.
    const plRes = await this.client(credentials).query<{
      workspace?: { pipelinesConnection?: { nodes?: Array<{ id: string; name?: string }> } }
    }>(Q_PIPELINES_FOR_WORKSPACE, { workspaceId })
    const pipelines = plRes.data?.workspace?.pipelinesConnection?.nodes ?? []

    // Collect issues from all pipelines, dedup by id, filter to this repo.
    const seen = new Set<string>()
    const tasks: Task[] = []
    for (const pipeline of pipelines) {
      const res = await this.client(credentials).query<SearchIssuesData>(Q_ISSUES_BY_PIPELINE, {
        pipelineId: pipeline.id,
        first,
        ...(after ? { after } : {}),
      })
      for (const issue of res.data?.searchIssuesByPipeline?.nodes ?? []) {
        if (seen.has(issue.id)) continue
        // Filter to the requested repository.
        if (issue.repository?.id && issue.repository.id !== projectId) continue
        seen.add(issue.id)
        tasks.push(transformTask(issue, projectId))
      }
    }
    return tasks
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).query<IssueNodeData>(Q_ISSUE_NODE, { id })
    const node = res.data?.node
    if (!node) throw new Error(`ZenHub issue ${id} not found`)
    return transformTask(node)
  }

  // ── Comments ─────────────────────────────────────────────────────────────
  //
  // `Issue.comments(first, after): CommentConnection!` in the public schema.
  // The issue is read through `node(id)`; an id that is not an Issue (or
  // does not exist) has no `comments` and is reported as not found.

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const client = this.client(credentials)
    const rows = await this.relayPage<RawZenhubComment>(
      credentials,
      `issue-comments:${taskId}`,
      params,
      async (first, after) => {
        const res = await client.query<IssueCommentsData>(Q_ISSUE_COMMENTS, {
          id: taskId,
          first,
          ...(after ? { after } : {}),
        })
        return gqlData(res).node?.comments ?? null
      },
    )
    return rows.map((c) => transformComment(c, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // Not rebuilt in this pass: comments are read through their parent issue.
    throw new Error(`ZenHub getComment: cannot fetch comment ${id} without parent issue context`)
  }

  // ── Tags (labels) ─────────────────────────────────────────────────────────

  async listTags(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    // `workspaceId` in the canonical interface maps to ZenHub repository id
    // (we use repo as "project", so listTags(workspaceId=repoId) is correct).
    //
    // Relay paging (https://developers.zenhub.com/graphql-api-docs/pagination):
    // `first` (≤ 100) and `after` = the previous `pageInfo.endCursor` while
    // `pageInfo.hasNextPage` is true. One upstream page is one caller page;
    // an explicit `cursor` param still names the upstream page directly.
    const first = this.pageSize(params)
    const client = this.client(credentials)
    const fetchPage = async (after: string | undefined) => {
      const res = await client.query<RepositoryNodeData>(Q_REPOSITORY_LABELS, {
        id: workspaceId,
        first,
        ...(after ? { after } : {}),
      })
      const labels = res.data?.node?.labels
      const next = labels?.pageInfo?.hasNextPage ? (labels.pageInfo.endCursor ?? null) : null
      return { items: labels?.nodes ?? [], next }
    }
    const explicit = params['cursor'] ? String(params['cursor']) : undefined
    let result: { items: RawZenhubLabel[]; hasMore: boolean }
    if (explicit !== undefined) {
      const res = await fetchPage(explicit)
      result = { items: res.items, hasMore: res.next !== null }
    } else {
      const key = cursorPagerKey(connectionScope('zenhub', credentials), `labels:${workspaceId}`, {
        limit: first,
      })
      result = await pageByCursor<RawZenhubLabel>(key, params.page, fetchPage)
    }
    const limit = params.limit
    const clamped = typeof limit === 'number' && limit > first
    reportUpstreamPage(params, { hasMore: result.hasMore, ...(clamped ? { pageSize: first } : {}) })
    return result.items.map((l) => transformTag(l, workspaceId))
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    // ZenHub has no label-by-id endpoint.
    throw new Error(
      `ZenHub getTag: cannot fetch label ${id} directly; use listTags on the repository`,
    )
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  //
  // `Workspace.zenhubUsers(first, after): ZenhubUserConnection!` lists a
  // workspace's members; `node(id) { ... on ZenhubUser }` reads one back.

  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const client = this.client(credentials)
    const rows = await this.relayPage<RawZenhubUser>(
      credentials,
      `workspace-users:${workspaceId}`,
      params,
      async (first, after) => {
        const res = await client.query<WorkspaceUsersData>(Q_WORKSPACE_USERS, {
          id: workspaceId,
          first,
          ...(after ? { after } : {}),
        })
        return gqlData(res).workspace?.zenhubUsers ?? null
      },
    )
    return rows.map((u) => transformUser(u, workspaceId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).query<UserNodeData>(Q_USER_NODE, { id })
    const node = gqlData(res).node
    if (!node || !('id' in node) || typeof node.id !== 'string') {
      throw notFound(`ZenHub user ${id} not found`)
    }
    return transformUser(node as RawZenhubUser)
  }
}

export { DEFAULT_PAGE_SIZE }

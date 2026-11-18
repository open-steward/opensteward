/**
 * ZohoBugtracker adapter for the projects vertical.
 *
 * Zoho BugTracker organises resources as:
 *   Portal (= Workspace) → Project → Bug (= Task) → Comment
 *   Portal → User
 *   Portal → Tag
 *
 * Base URL: https://projectsapi.zoho.com/restapi  (v1/v2 resources)
 *           https://projectsapi.zoho.com/api/v3    (v3 resources: tags)
 * Auth: OAuth2 — `Zoho-oauthtoken <access_token>` header
 * Pagination: `index` (1-based offset) + `range` (max 100 per page)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * All 6 canonical resources are available: comment, project, tag, task, user, workspace.
 */
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'

import { buildAuthUrl, exchangeCode as zohoBugtrackerExchange, refreshCredentials as zohoBugtrackerRefresh } from './auth'
import { ZohoBugtrackerClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, API_V3_BASE_URL } from './constants'

import { transformProject, type RawZohoBugtrackerProject } from './transform/project'
import { transformTask, type RawZohoBugtrackerBug } from './transform/task'
import { transformComment, type RawZohoBugtrackerComment } from './transform/comment'
import { transformWorkspace, type RawZohoBugtrackerPortal } from './transform/workspace'
import { transformUser, type RawZohoBugtrackerUser } from './transform/user'
import { transformTag, type RawZohoBugtrackerTag } from './transform/tag'

export interface ZohoBugtrackerAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** Zoho BugTracker list endpoints wrap arrays in a named key */
interface PortalListResponse {
  portals?: RawZohoBugtrackerPortal[]
}

interface ProjectListResponse {
  projects?: RawZohoBugtrackerProject[]
}

interface BugListResponse {
  bugs?: RawZohoBugtrackerBug[]
}

interface CommentListResponse {
  comments?: RawZohoBugtrackerComment[]
}

interface UserListResponse {
  users?: RawZohoBugtrackerUser[]
}

interface TagListResponse {
  tags?: RawZohoBugtrackerTag[]
}

/** Single-resource wrappers */
interface ProjectGetResponse {
  projects?: RawZohoBugtrackerProject[]
}

interface BugGetResponse {
  bugs?: RawZohoBugtrackerBug[]
}

export class ZohoBugtrackerAdapter implements ProjectsAdapter {
  readonly platform = 'zoho-bugtracker'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ZohoBugtrackerAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return zohoBugtrackerExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return zohoBugtrackerRefresh(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): ZohoBugtrackerClient {
    return new ZohoBugtrackerClient(credentials)
  }

  /**
   * Build pagination params for Zoho BugTracker's index/range scheme.
   * index is 1-based; cursor in QueryParams stores the next index value.
   */
  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      range: params.limit ?? DEFAULT_PAGE_SIZE,
      index: params['cursor'] ? Number(params['cursor']) : 1,
    }
  }

  // ── Workspaces (Portals) ─────────────────────────────────────────────────

  /**
   * `GET /restapi/portals/` takes no paging input: "Gets all the portals for
   * the logged-in user." Every portal comes back at once, so the caller's
   * page is cut locally.
   * https://www.zoho.com/projects/help/rest-api/bugtracker-portal-api.html
   */
  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const res = await this.client(credentials).get<PortalListResponse>('/portals/')
    return pageLocally((res.portals ?? []).map(transformWorkspace), params)
  }

  async getWorkspace(credentials: Credentials, portalId: string): Promise<Workspace> {
    const res = await this.client(credentials).get<PortalListResponse>('/portals/')
    const portal = (res.portals ?? []).find(
      (p) => String(p.id) === portalId || pickIdString(p) === portalId,
    )
    if (!portal) throw new Error(`ZohoBugtracker portal ${portalId} not found`)
    return transformWorkspace(portal)
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const portalId = String(params['workspace_id'] ?? '')
    if (!portalId) return []
    const res = await this.client(credentials).get<ProjectListResponse>(
      `/portal/${portalId}/projects/`,
      this.listParams(params),
    )
    return (res.projects ?? []).map((p) => transformProject(p, portalId))
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    // id expected as "portalId:projectId" composite key when called standalone
    const [portalId, projectId] = id.includes(':') ? id.split(':', 2) : ['', id]
    if (!portalId) throw new Error('ZohoBugtracker getProject: pass id as "portalId:projectId"')
    const res = await this.client(credentials).get<ProjectGetResponse>(
      `/portal/${portalId}/projects/${projectId}/`,
    )
    const project = res.projects?.[0]
    if (!project) throw new Error(`ZohoBugtracker project ${id} not found`)
    return transformProject(project, portalId)
  }

  // ── Tasks (Bugs) ─────────────────────────────────────────────────────────

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const portalId = String(params['workspace_id'] ?? '')
    if (!portalId) return []
    const res = await this.client(credentials).get<BugListResponse>(
      `/portal/${portalId}/projects/${projectId}/bugs/`,
      this.listParams(params),
    )
    return (res.bugs ?? []).map((b) => transformTask(b, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // id expected as "portalId:projectId:bugId" composite key when called standalone
    const parts = id.split(':')
    if (parts.length < 3) throw new Error('ZohoBugtracker getTask: pass id as "portalId:projectId:bugId"')
    const [portalId, projectId, bugId] = parts
    const res = await this.client(credentials).get<BugGetResponse>(
      `/portal/${portalId}/projects/${projectId}/bugs/${bugId}/`,
    )
    const bug = res.bugs?.[0]
    if (!bug) throw new Error(`ZohoBugtracker bug ${id} not found`)
    return transformTask(bug, projectId)
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    const portalId = String(params['workspace_id'] ?? '')
    const projectId = String(params['project_id'] ?? '')
    if (!portalId || !projectId) return []
    const res = await this.client(credentials).get<CommentListResponse>(
      `/portal/${portalId}/projects/${projectId}/bugs/${taskId}/comments/`,
      this.listParams(params),
    )
    return (res.comments ?? []).map((c) => transformComment(c, taskId, projectId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // id expected as "portalId:projectId:bugId:commentId" composite key
    const parts = id.split(':')
    if (parts.length < 4) throw new Error('ZohoBugtracker getComment: pass id as "portalId:projectId:bugId:commentId"')
    const [portalId, projectId, bugId, commentId] = parts
    const res = await this.client(credentials).get<CommentListResponse>(
      `/portal/${portalId}/projects/${projectId}/bugs/${bugId}/comments/`,
    )
    const comment = (res.comments ?? []).find((c) => String(c.id) === commentId || pickIdString(c) === commentId)
    if (!comment) throw new Error(`ZohoBugtracker comment ${id} not found`)
    return transformComment(comment, bugId, projectId)
  }

  // ── Users ────────────────────────────────────────────────────────────────

  /**
   * `GET /restapi/portal/[PORTALID]/users/` "Gets the details of all users in
   * a specific portal." Its only request parameter is `user_type`: no index or
   * range, so the whole list comes back and the caller's page is cut locally.
   * https://www.zoho.com/projects/help/rest-api/bugtracker-users-api.html
   */
  async listUsers(credentials: Credentials, portalId: string, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<UserListResponse>(`/portal/${portalId}/users/`)
    return pageLocally(
      (res.users ?? []).map((u) => transformUser(u, portalId)),
      params,
    )
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    // id expected as "portalId:userId" composite key when called standalone
    const [portalId, userId] = id.includes(':') ? id.split(':', 2) : ['', id]
    if (!portalId) throw new Error('ZohoBugtracker getUser: pass id as "portalId:userId"')
    const res = await this.client(credentials).get<UserListResponse>(
      `/portal/${portalId}/users/`,
    )
    const user = (res.users ?? []).find((u) => String(u.id) === userId || String(u.zpuid) === userId)
    if (!user) throw new Error(`ZohoBugtracker user ${id} not found`)
    return transformUser(user, portalId)
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  /**
   * `GET /api/v3/portal/[PORTALID]/tags` pages by `index` ("Index number of
   * the tag", sample value 0) and `range` ("Range of the tags", sample 100),
   * so `index` is the 0-based row offset of the page. The response carries no
   * total and no next marker: a full page means there may be more.
   * https://www.zoho.com/projects/help/rest-api/bugtracker-tags-api.html
   */
  async listTags(credentials: Credentials, portalId: string, params: QueryParams): Promise<Tag[]> {
    // Tags API lives under /api/v3 (not /restapi); pass the full URL so axios
    // bypasses the baseURL and uses the absolute path directly.
    const range = params.limit ?? DEFAULT_PAGE_SIZE
    const res = await this.client(credentials).get<TagListResponse>(
      `${API_V3_BASE_URL}/portal/${portalId}/tags`,
      { range, index: pageOffset(params, range) },
    )
    const tags = res.tags ?? []
    reportUpstreamPage(params, { hasMore: tags.length >= range })
    return tags.map((t) => transformTag(t, portalId))
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    // id expected as "portalId:tagId" composite key when called standalone
    const [portalId, tagId] = id.includes(':') ? id.split(':', 2) : ['', id]
    if (!portalId) throw new Error('ZohoBugtracker getTag: pass id as "portalId:tagId"')
    const res = await this.client(credentials).get<TagListResponse>(
      `${API_V3_BASE_URL}/portal/${portalId}/tags`,
    )
    const tag = (res.tags ?? []).find((t) => String(t.id) === tagId || pickIdString(t) === tagId)
    if (!tag) throw new Error(`ZohoBugtracker tag ${id} not found`)
    return transformTag(tag, portalId)
  }
}

/** Helper: extract id_string or fall back to id as string */
function pickIdString(obj: { id?: string | number; id_string?: string }): string {
  return obj.id_string ?? (obj.id != null ? String(obj.id) : '')
}

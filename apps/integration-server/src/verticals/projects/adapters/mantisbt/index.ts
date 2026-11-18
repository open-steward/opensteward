/**
 * MantisBT adapter for the projects vertical.
 *
 * MantisBT is a self-hosted bug tracker. Its REST API is mounted at
 * `{host}/api/rest` and authenticated with a raw API token in the
 * `Authorization` header (no "Bearer" prefix). There is no OAuth2 flow.
 *
 * The host URL is stored in `credentials.extra.host`. It defaults to the
 * canonical demo host (`https://mantisbt.org/bugs`) if not supplied.
 *
 * Supported canonical resources:
 *   - Projects  GET /projects, GET /projects/{id}
 *   - Tasks     GET /issues?project_id={pid}&page=&page_size=, GET /issues/{id}
 *   - Comments  the `notes` of GET /issues/{id} (REST has no GET for notes)
 *   - Tags      derived from issues' `tags` arrays (list per project)
 *   - Users     GET /users/me, GET /users/{id}
 *
 * Workspaces are intentionally NOT implemented: MantisBT has no workspace
 * concept. Tags do not have their own list endpoint — they are collected
 * from issues on a per-project basis.
 *
 * MantisBT does not document a webhook signature mechanism, so verifyWebhook
 * and parseWebhookEvents are not implemented.
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: workspace — MantisBT has no workspace/organisation concept; the REST API (swagger.json) exposes no such endpoint
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  simpleApiKey,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  exchangeCode as mantisbtExchange,
  refreshCredentials as mantisbtRefresh,
} from './auth'
import { MantisbtClient, mantisbtHost } from './client'
import { API_KEY_HELP_URL, DEFAULT_PAGE_SIZE, MAX_TAG_SCAN_PAGES } from './constants'

import { transformProject, type RawMantisbtProject } from './transform/project'
import { transformIssue, type RawMantisbtIssue } from './transform/task'
import { transformNote, type RawMantisbtNote } from './transform/comment'
import { transformTag, type RawMantisbtTag } from './transform/tag'
import { transformUser, type RawMantisbtUser } from './transform/user'

/** GET /projects response */
interface ProjectsResponse {
  projects?: RawMantisbtProject[]
}

/** GET /issues response */
interface IssuesResponse {
  issues?: RawMantisbtIssue[]
  total_count?: number
}

/** GET /issues/{id}?select=id,project,notes response */
interface IssueNotesResponse {
  issues?: Array<{
    id?: number
    project?: { id?: number; name?: string } | null
    notes?: RawMantisbtNote[] | null
  }>
}

/** Connect Link form: api token + optional self-hosted URL */
const CONNECT_FORM = simpleApiKey({
  label: 'API token',
  helpText: `Generate an API token from your MantisBT account (My Account → API Tokens). See ${API_KEY_HELP_URL}`,
})

export class MantisbtAdapter implements ProjectsAdapter {
  readonly platform = 'mantisbt'
  readonly version = '0.1.0'

  // Connect Link support — single API-token form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return mantisbtExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return mantisbtRefresh(credentials)
  }

  private client(credentials: Credentials): MantisbtClient {
    return new MantisbtClient(credentials)
  }

  /**
   * GET /issues pages by `page` (1-based) and `page_size`, and answers with
   * neither a count nor a next link; a page past the last is empty. Each
   * upstream page is sized to the caller's limit and the row pager peeks at
   * the next one when a caller page ends full, so `hasMore` is exact. A
   * sequential walk still costs one request per page: the peeked page serves
   * the next caller page.
   */
  private async issuePage(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<RawMantisbtIssue[]> {
    const pageSize = Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE))
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope(mantisbtHost(credentials), credentials), '/issues', {
      project_id: projectId,
      page_size: pageSize,
    })
    const res = await pageByRows<RawMantisbtIssue, number>(
      key,
      params,
      async (page) => {
        const current = page ?? 1
        const body = await client.get<IssuesResponse>('/issues', {
          project_id: projectId,
          page_size: pageSize,
          page: current,
        })
        const issues = body.issues ?? []
        // A short page is the last one.
        return { items: issues, next: issues.length >= pageSize ? current + 1 : null }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return res.items
  }

  /** Every issue in the project, walked at the documented default page size. */
  private async allIssues(
    credentials: Credentials,
    projectId: string,
  ): Promise<RawMantisbtIssue[]> {
    const client = this.client(credentials)
    const all: RawMantisbtIssue[] = []
    for (let page = 1; page <= MAX_TAG_SCAN_PAGES; page++) {
      const res = await client.get<IssuesResponse>('/issues', {
        project_id: projectId,
        page,
        page_size: DEFAULT_PAGE_SIZE,
      })
      const issues = res.issues ?? []
      all.push(...issues)
      if (issues.length < DEFAULT_PAGE_SIZE) return all
    }
    throw new Error(
      `MantisBT project ${projectId} has more than ${MAX_TAG_SCAN_PAGES * DEFAULT_PAGE_SIZE} issues to scan for tags`,
    )
  }

  // ── Projects ────────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    // GET /projects takes no paging parameters and returns every accessible project.
    const res = await this.client(credentials).get<ProjectsResponse>('/projects')
    return pageLocally((res.projects ?? []).map(transformProject), params)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<ProjectsResponse>(`/projects/${id}`)
    const single = res.projects?.[0]
    if (!single) throw new Error(`MantisBT project ${id} not found`)
    return transformProject(single)
  }

  // ── Tasks (issues) ───────────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const issues = await this.issuePage(credentials, projectId, params)
    return issues.map((issue) => transformIssue(issue, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // GET /issues/{id} returns the issue object directly (not wrapped in array)
    const raw = await this.client(credentials).get<RawMantisbtIssue | IssuesResponse>(
      `/issues/${id}`,
    )
    // Some MantisBT versions wrap in { issues: [...] }; others return directly
    const issue: RawMantisbtIssue =
      raw &&
      typeof raw === 'object' &&
      'issues' in raw &&
      Array.isArray((raw as IssuesResponse).issues)
        ? ((raw as IssuesResponse).issues?.[0] ?? {})
        : (raw as RawMantisbtIssue)
    if (!issue.id) throw new Error(`MantisBT issue ${id} not found`)
    return transformIssue(issue)
  }

  // ── Comments (notes) ────────────────────────────────────────────────────────

  /**
   * The issue's notes. REST registers no GET on /issues/{id}/notes (only
   * `$g_app->post( '/{id}/notes', 'rest_issue_note_add' )` and a delete);
   * GET /issues/{id} answers `{ issues: [issue] }`, and the issue carries
   * `notes` (null when it has none) when `select` names it.
   */
  private async issueNotes(
    credentials: Credentials,
    issueId: string,
  ): Promise<{ notes: RawMantisbtNote[]; projectId: string | undefined }> {
    const res = await this.client(credentials).get<IssueNotesResponse>(
      `/issues/${encodeURIComponent(issueId)}`,
      { select: 'id,project,notes' },
    )
    const issue = res.issues?.[0]
    if (!issue) throw new Error(`MantisBT issue ${issueId} not found`)
    return {
      notes: issue.notes ?? [],
      projectId: issue.project?.id != null ? String(issue.project.id) : undefined,
    }
  }

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    // Every visible note of the issue arrives in one response: page it locally.
    const { notes, projectId } = await this.issueNotes(credentials, taskId)
    return pageLocally(
      notes.map((n) => transformNote(n, taskId, projectId)),
      params,
    )
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // No note route exists, so the id is `{issueId}:{noteId}` (as listComments
    // returns it) and the note is found on its issue.
    const [issueId, noteId] = id.split(':')
    if (!issueId || !noteId)
      throw new Error(`MantisBT note id must be "{issueId}:{noteId}", got "${id}"`)
    const { notes, projectId } = await this.issueNotes(credentials, issueId)
    const note = notes.find((n) => String(n.id) === noteId)
    if (!note) throw new Error(`MantisBT note ${id} not found`)
    return transformNote(note, issueId, projectId)
  }

  // ── Tags ────────────────────────────────────────────────────────────────────
  //
  // MantisBT does not expose a standalone /tags endpoint. Tags are attached to
  // issues and returned in the issue payload. We collect unique tags from
  // every page of issues in the project, then page that whole set locally.

  async listTags(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    // workspaceId doubles as projectId for MantisBT
    const projectId = workspaceId
    const issues = await this.allIssues(credentials, projectId)
    const seen = new Set<string>()
    const tags: Tag[] = []
    for (const issue of issues) {
      for (const rawTag of issue.tags ?? []) {
        const tagId = String(rawTag.id ?? '')
        if (!tagId || seen.has(tagId)) continue
        seen.add(tagId)
        tags.push(transformTag(rawTag as RawMantisbtTag))
      }
    }
    return pageLocally(tags, params)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    // No standalone tag endpoint — scan recent issues for the tag
    const res = await this.client(credentials).get<IssuesResponse>('/issues', {
      page: 1,
      page_size: DEFAULT_PAGE_SIZE,
    })
    for (const issue of res.issues ?? []) {
      for (const rawTag of issue.tags ?? []) {
        if (String(rawTag.id ?? '') === id) {
          return transformTag(rawTag as RawMantisbtTag)
        }
      }
    }
    throw new Error(`MantisBT tag ${id} not found`)
  }

  // ── Users ───────────────────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    // MantisBT only exposes GET /users/me for the current user via REST: a
    // collection of at most one, paged locally.
    const me = await this.client(credentials).get<RawMantisbtUser>('/users/me')
    return pageLocally(me?.id ? [transformUser(me)] : [], params)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawMantisbtUser>(`/users/${id}`)
    if (!raw?.id) throw new Error(`MantisBT user ${id} not found`)
    return transformUser(raw)
  }
}

export { DEFAULT_PAGE_SIZE }

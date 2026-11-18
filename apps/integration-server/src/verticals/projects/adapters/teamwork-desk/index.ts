/**
 * Teamwork Spaces adapter for the projects vertical.
 *
 * Teamwork Spaces is a wiki/knowledge-base product that exposes a REST API at
 *   https://{siteName}.teamwork.com/spaces/api/v1/
 *
 * Authentication: long-lived API key in `Authorization: Bearer <key>`.
 * The site URL is captured at connect time through a two-field Connect Link
 * form (`simpleApiKey` extended with a custom `siteUrl` field stored in
 * `credentials.extra.siteUrl`).
 *
 * Canonical mapping:
 *   Projects  ← spaces      GET /spaces.json
 *   Tasks     ← pages       GET /spaces/{spaceId}/pages.json (page tree)
 *                           GET /spaces/{spaceId}/pages/{pageId}.json
 *   Comments  ← inline comments
 *                           GET /spaces/{spaceId}/pages/{pageId}/comments/inline.json
 *   Users     ← users       GET /users.json
 *   Tags      ← tags        GET /tags.json
 *
 * Pagination: the documented list endpoints for spaces, inline comments, users
 * and tags take no query parameters and return the whole collection ("Get all
 * spaces users", "get all tags", "get all comments for a page";
 * https://apidocs.teamwork.com/docs/spaces), so those lists fetch everything
 * and page locally with `pageLocally`.
 *
 * Webhooks: HMAC-SHA256 hex in the `Signature` header.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: workspace — The installation is the workspace; there is no
 *   list-workspaces endpoint in the Teamwork Spaces API.
 */
import { customForm, pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as spacesExchange,
  refreshCredentials as spacesRefresh,
} from './auth'
import { TeamworkSpacesClient } from './client'
import { TOKEN_HELP_URL } from './constants'
import { verifySpacesWebhook, parseSpacesWebhookEvents } from './webhook'

import { transformProject, type RawSpacesSpace } from './transform/project'
import {
  transformTask,
  transformTreePage,
  type RawSpacesPage,
  type RawSpacesTreePage,
} from './transform/task'
import { transformComment, type RawSpacesComment } from './transform/comment'
import { transformUser, type RawSpacesUser } from './transform/user'
import { transformTag, type RawSpacesTag } from './transform/tag'

// ── Response envelope shapes ──────────────────────────────────────────────────

/** GET /spaces.json → { spaces: { Spaces: [...] } } */
interface SpacesListResponse {
  spaces?: {
    Spaces?: RawSpacesSpace[]
  }
}

/**
 * GET /spaces/{spaceID}/pages.json → `spaces-api.SpaceContents`, documented as
 *   { pages: { pages: SpacePages, private: SpacePages[] } }
 * where `spaces-api.SpacePages` is
 *   { trash: [{ id, slug, title, updatedAt, childPages: [...] }] }
 * https://apidocs.teamwork.com/docs/spaces/v1/space-content/get-v1-spaces-space-id-pages-json
 */
interface RawSpacePagesTree {
  trash?: RawSpacesTreePage[]
}
interface SpaceContentsResponse {
  pages?: {
    pages?: RawSpacePagesTree
    private?: RawSpacePagesTree[]
  }
}

/** GET /spaces/{spaceID}/pages/{pageID}.json → { page: {...} } */
interface PageResponse {
  page?: RawSpacesPage
}

/** A response that is not the documented shape is an error, never an empty tree. */
function treeNodes(tree: RawSpacePagesTree | undefined, where: string): RawSpacesTreePage[] {
  if (!tree || !Array.isArray(tree.trash)) {
    throw new Error(
      `Teamwork Spaces pages.json: ${where} is not the documented SpacePages shape ({ trash: [...] })`,
    )
  }
  return tree.trash
}

/**
 * Flatten the documented page tree, depth-first, parent before children.
 * "SpacePages contains a tree of pages nested under their parents."
 */
function flattenPages(res: SpaceContentsResponse, spaceId: string): Task[] {
  const contents = res.pages
  if (!contents || typeof contents !== 'object') {
    throw new Error('Teamwork Spaces pages.json: response has no documented `pages` object')
  }
  const out: Task[] = []
  const walk = (nodes: RawSpacesTreePage[], parent: string | undefined, isPrivate: boolean) => {
    for (const node of nodes) {
      out.push(transformTreePage(node, spaceId, parent, isPrivate))
      if (node.childPages) walk(node.childPages, String(node.id), isPrivate)
    }
  }
  walk(treeNodes(contents.pages, 'pages.pages'), undefined, false)
  if (contents.private !== undefined) {
    if (!Array.isArray(contents.private)) {
      throw new Error('Teamwork Spaces pages.json: pages.private is not the documented array')
    }
    for (const tree of contents.private) walk(treeNodes(tree, 'pages.private[]'), undefined, true)
  }
  return out
}

/** Split a `{spaceID}:{pageID}` task id. */
function splitTaskId(id: string): { spaceId: string; pageId: string } {
  const sep = id.indexOf(':')
  if (sep <= 0 || sep === id.length - 1) {
    throw new Error(`Teamwork Spaces task id must be in '{spaceId}:{pageId}' form; got '${id}'.`)
  }
  return { spaceId: id.slice(0, sep), pageId: id.slice(sep + 1) }
}

/** GET /spaces/{spaceId}/pages/{pageId}/comments/inline.json → { comments: [{ comment, replies }] } */
interface CommentsListResponse {
  comments?: Array<{
    comment?: RawSpacesComment
    replies?: Array<{ comment?: RawSpacesComment }>
  }>
}

/** GET /users.json → { users: [...] } */
interface UsersListResponse {
  users?: RawSpacesUser[]
}

/** GET /tags.json → { tags: [...] } */
interface TagsListResponse {
  tags?: RawSpacesTag[]
}

// ── Connect Link form ─────────────────────────────────────────────────────────

/**
 * Two-field Connect Link form:
 *   1. Site URL → stored as credentials.extra.siteUrl
 *   2. API key  → stored as credentials.accessToken
 *
 * Teamwork is subdomain-routed (https://{site}.teamwork.com), so the site URL
 * must be captured at connect time.
 */
const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'siteUrl',
      label: 'Site URL',
      type: 'text',
      required: true,
      placeholder: 'https://mycompany.teamwork.com',
      helpText: 'The base URL of your Teamwork installation, e.g. https://mycompany.teamwork.com',
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      placeholder: 'your-api-key',
      helpText: `Generate an API key from Settings → API Keys in your Teamwork installation. See ${TOKEN_HELP_URL}`,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const siteUrl = (fields['siteUrl'] ?? '').trim().replace(/\/$/, '')
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!siteUrl) throw new Error('Site URL is required.')
    if (!apiKey) throw new Error('API key is required.')
    return {
      accessToken: apiKey,
      extra: { siteUrl },
    }
  },
})

export class TeamworkDeskAdapter implements ProjectsAdapter {
  readonly platform = 'teamwork-desk'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return spacesExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return spacesRefresh(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySpacesWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSpacesWebhookEvents(payload)
  }

  private client(credentials: Credentials): TeamworkSpacesClient {
    return new TeamworkSpacesClient(credentials)
  }

  // ── Projects (spaces) ─────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    // GET /spaces.json documents no query parameters: the whole list.
    const res = await this.client(credentials).get<SpacesListResponse>('/spaces.json')
    return pageLocally(res.spaces?.Spaces ?? [], params).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    // Teamwork Spaces has no single-space GET endpoint — fetch the list and
    // find by id. This is only used for the canonical getProject method and
    // is acceptable given the small number of spaces per installation.
    const res = await this.client(credentials).get<SpacesListResponse>('/spaces.json')
    const space = (res.spaces?.Spaces ?? []).find((s) => String(s.id) === id)
    if (!space) throw new Error(`Teamwork Spaces space ${id} not found`)
    return transformProject(space)
  }

  // ── Tasks (pages) ─────────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    // GET /spaces/{spaceID}/pages.json documents only the spaceID path
    // parameter and returns the whole page tree: flatten it, page locally.
    const res = await this.client(credentials).get<SpaceContentsResponse>(
      `/spaces/${encodeURIComponent(projectId)}/pages.json`,
    )
    return pageLocally(flattenPages(res, projectId), params)
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // GET /spaces/{spaceID}/pages/{pageID}.json — "Returns a single page by pageID".
    const { spaceId, pageId } = splitTaskId(id)
    const res = await this.client(credentials).get<PageResponse>(
      `/spaces/${encodeURIComponent(spaceId)}/pages/${encodeURIComponent(pageId)}.json`,
    )
    if (!res.page) throw new Error(`Teamwork Spaces page ${id} not found`)
    return transformTask(res.page, spaceId)
  }

  // ── Comments (inline page comments) ──────────────────────────────────────

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    // taskId is expected to be in '{spaceId}:{pageId}' composite form because
    // the endpoint is scoped under both a space and a page.
    const sep = taskId.indexOf(':')
    let spaceId: string
    let pageId: string
    if (sep === -1) {
      // Fall back: treat taskId as pageId with no spaceId (will fail at HTTP
      // level if the server rejects it, giving a clear error to callers).
      spaceId = ''
      pageId = taskId
    } else {
      spaceId = taskId.slice(0, sep)
      pageId = taskId.slice(sep + 1)
    }
    // The inline-comments endpoint documents no query parameters ("get all
    // comments for a page"): flatten the whole thread, then page locally.
    const res = await this.client(credentials).get<CommentsListResponse>(
      `/spaces/${spaceId}/pages/${pageId}/comments/inline.json`,
    )
    const comments: Comment[] = []
    for (const entry of res.comments ?? []) {
      if (entry.comment) {
        comments.push(transformComment(entry.comment, pageId, spaceId))
      }
      for (const reply of entry.replies ?? []) {
        if (reply.comment) {
          comments.push(transformComment(reply.comment, pageId, spaceId))
        }
      }
    }
    return pageLocally(comments, params)
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // There is no direct comment-by-id GET in the Spaces API. The composite
    // id is '{spaceId}:{pageId}:{commentId}'; callers must provide all three
    // segments.
    const parts = id.split(':')
    if (parts.length < 3) {
      throw new Error(
        `Teamwork Spaces comment id must be in '{spaceId}:{pageId}:{commentId}' form; got '${id}'.`,
      )
    }
    const [spaceId, pageId, commentId] = parts
    const res = await this.client(credentials).get<CommentsListResponse>(
      `/spaces/${spaceId}/pages/${pageId}/comments/inline.json`,
    )
    for (const entry of res.comments ?? []) {
      if (entry.comment && String(entry.comment.id) === commentId) {
        return transformComment(entry.comment, pageId, spaceId)
      }
      for (const reply of entry.replies ?? []) {
        if (reply.comment && String(reply.comment.id) === commentId) {
          return transformComment(reply.comment, pageId, spaceId)
        }
      }
    }
    throw new Error(`Teamwork Spaces comment ${id} not found`)
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    // GET /users.json documents no query parameters: the whole list.
    const res = await this.client(credentials).get<UsersListResponse>('/users.json')
    return pageLocally(res.users ?? [], params).map((u) => transformUser(u))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<UsersListResponse>('/users.json')
    const user = (res.users ?? []).find((u) => String(u.id) === id)
    if (!user) throw new Error(`Teamwork Spaces user ${id} not found`)
    return transformUser(user)
  }

  // ── Tags ───────────────────────────────────────────────────────────────────

  async listTags(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    // GET /tags.json documents no query parameters: the whole list.
    const res = await this.client(credentials).get<TagsListResponse>('/tags.json')
    return pageLocally(res.tags ?? [], params).map(transformTag)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    // Teamwork Spaces has no single-tag GET endpoint — fetch the list and
    // find by id. Tag lists are typically small so this is acceptable.
    const res = await this.client(credentials).get<TagsListResponse>('/tags.json')
    const tag = (res.tags ?? []).find((t) => String(t.id) === id)
    if (!tag) throw new Error(`Teamwork Spaces tag ${id} not found`)
    return transformTag(tag)
  }
}

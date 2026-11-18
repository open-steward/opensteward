/**
 * Yandex Tracker adapter for the projects vertical.
 *
 * Auth:  OAuth 2.0 — `Authorization: OAuth <token>` header.
 * Org:   `orgId` config field → `X-Org-ID` (numeric/360) or `X-Cloud-Org-Id` (cloud).
 * Model: Queues ≈ Workspaces; Projects ≈ Projects; Issues ≈ Tasks.
 *        Tags are the strings GET /v3/queues/{queue_ID}/tags returns for a queue
 *        (every upstream page read, then paged locally).
 * Pagination (https://yandex.ru/support/tracker/en/common-format, "Paginated
 * display of results"): `perPage` + `page` query params, with the
 * `X-Total-Pages` / `X-Total-Count` response headers. Issue search takes
 * them in the query string, not the body. Comments page by `perPage` + `id`
 * (the comment after which the page begins), with the next page in the
 * `Link` header. No maximum `perPage` is documented, so none is declared.
 *
 * Docs: https://yandex.ru/support/tracker/en/api-ref/about-api
 */
import type { Credentials, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import { buildAuthUrl, exchangeCode as ytExchange, refreshCredentials as ytRefresh } from './auth'
import { YandexTrackerClient, type UpstreamResponse } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'

import { transformProject, type RawYandexTrackerProject } from './transform/project'
import { transformTask, type RawYandexTrackerIssue } from './transform/task'
import { transformComment, type RawYandexTrackerComment } from './transform/comment'
import { transformTag, type RawYandexTrackerTag } from './transform/tag'
import { transformWorkspace, type RawYandexTrackerQueue } from './transform/workspace'
import { transformUser, type RawYandexTrackerUser } from './transform/user'

export interface YandexTrackerAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Yandex 360 org ID (numeric) or Yandex Cloud org ID (alphanumeric). */
  orgId?: string
  scopes?: string[]
}

export class YandexTrackerAdapter implements ProjectsAdapter {
  readonly platform = 'yandex-tracker'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private orgId: string | undefined
  private scopes: string[]

  constructor(config: YandexTrackerAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.orgId = config.orgId
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return ytExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return ytRefresh(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): YandexTrackerClient {
    return new YandexTrackerClient(credentials, this.orgId)
  }

  /**
   * The documented `perPage` + `page` pair for the caller's page. A legacy
   * numeric `cursor` is still read as a page number when `page` is absent.
   */
  private pageParams(params: QueryParams): { perPage: number; page: number } {
    const legacy = params['cursor'] ? Number(params['cursor']) : undefined
    const page = params.page ?? (legacy && Number.isFinite(legacy) ? legacy : 1)
    return { perPage: params.limit ?? DEFAULT_PAGE_SIZE, page }
  }

  /** Report the end from `X-Total-Pages` (and `X-Total-Count`), when the platform sent them. */
  private reportPage(params: QueryParams, page: number, headers: Record<string, string>): void {
    const totalPages = Number(headers['x-total-pages'])
    const totalCount = Number(headers['x-total-count'])
    const hasTotalPages = headers['x-total-pages'] !== undefined && Number.isFinite(totalPages)
    const hasTotalCount = headers['x-total-count'] !== undefined && Number.isFinite(totalCount)
    if (!hasTotalPages && !hasTotalCount) return
    reportUpstreamPage(params, {
      ...(hasTotalPages ? { totalPages, hasMore: page < totalPages } : {}),
      ...(hasTotalCount ? { totalCount } : {}),
    })
  }

  private async getPaged<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const paging = this.pageParams(params)
    const res: UpstreamResponse<T[]> = await this.client(credentials).getPage<T[]>(path, paging)
    this.reportPage(params, paging.page, res.headers)
    return Array.isArray(res.data) ? res.data : []
  }

  // ── Projects ──────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const res = await this.getPaged<RawYandexTrackerProject>(credentials, '/projects', params)
    return res.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<RawYandexTrackerProject>(`/projects/${id}`)
    return transformProject(res)
  }

  // ── Tasks (Issues) ────────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    // Search issues by project using Yandex Tracker query language
    // `perPage` and `page` are query parameters of _search; in the body they are ignored.
    const paging = this.pageParams(params)
    const res = await this.client(credentials).postPage<RawYandexTrackerIssue[]>(
      '/issues/_search',
      { filter: { project: projectId } },
      paging,
    )
    this.reportPage(params, paging.page, res.headers)
    return (Array.isArray(res.data) ? res.data : []).map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<RawYandexTrackerIssue>(`/issues/${id}`)
    return transformTask(res)
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const perPage = params.limit ?? DEFAULT_PAGE_SIZE
    const path = `/issues/${taskId}/comments`
    const fetchPage = async (id: string | undefined) => {
      const res = await this.client(credentials).getPage<RawYandexTrackerComment[]>(path, {
        perPage,
        ...(id !== undefined ? { id } : {}),
      })
      return {
        items: Array.isArray(res.data) ? res.data : [],
        next: nextCommentId(res.headers['link']),
      }
    }
    // An explicit upstream cursor is a position, not a page: fetch it as is.
    const explicit = params['cursor'] ? String(params['cursor']) : undefined
    let rows: RawYandexTrackerComment[]
    let hasMore: boolean
    if (explicit !== undefined) {
      const res = await fetchPage(explicit)
      rows = res.items
      hasMore = res.next !== undefined
    } else {
      const key = cursorPagerKey(
        connectionScope(`yandex-tracker:${this.orgId ?? ''}`, credentials),
        'comments',
        { taskId, limit: perPage },
      )
      const res = await pageByCursor<RawYandexTrackerComment, string>(key, params.page, fetchPage)
      rows = res.items
      hasMore = res.hasMore
    }
    reportUpstreamPage(params, { hasMore })
    return rows.map((c) => transformComment(c, taskId))
  }

  // ── Workspaces (Queues) ────────────────────────────────────────────────────

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const res = await this.getPaged<RawYandexTrackerQueue>(credentials, '/queues', params)
    return res.map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<RawYandexTrackerQueue>(`/queues/${id}`)
    return transformWorkspace(res)
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const res = await this.getPaged<RawYandexTrackerUser>(credentials, '/users', params)
    return res.map((u) => transformUser(u, workspaceId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawYandexTrackerUser>(`/users/${id}`)
    return transformUser(res)
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  /**
   * GET /v3/queues/{queue_ID}/tags
   * (https://yandex.ru/support/tracker/en/api/queues/get-tags): "Use this
   * request to get a list of tags added to a queue." The response is a bare
   * array of tag strings. The page documents no parameters of its own, but the
   * common format ("Paginated display of results") applies to every list: "If
   * you request a list of objects and the number of rows in the response
   * exceeds 50, the response returns a page", paged by `perPage` ("Default
   * value: 50") and `page`, with the `X-Total-Pages` header. So every upstream
   * page is read (a response without that header is the whole list) and the
   * complete list is paged here.
   */
  async listTags(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    const client = this.client(credentials)
    const path = `/queues/${encodeURIComponent(workspaceId)}/tags`
    const all: RawYandexTrackerTag[] = []
    let totalPages = 1
    for (let page = 1; page <= totalPages; page++) {
      const res = await client.getPage<RawYandexTrackerTag[]>(path, {
        perPage: DEFAULT_PAGE_SIZE,
        page,
      })
      if (!Array.isArray(res.data)) {
        throw new Error(`Yandex Tracker queue ${workspaceId} tags response is not an array`)
      }
      all.push(...res.data)
      const reported = Number(res.headers['x-total-pages'])
      if (res.headers['x-total-pages'] !== undefined && Number.isInteger(reported)) {
        totalPages = reported
      }
    }
    return pageLocally(
      all.map((t) => transformTag(t, workspaceId)),
      params,
    )
  }
}

/**
 * The `id` of the next comments page, from the `rel="next"` entry of the
 * `Link` header ("The links to the first and next pages are specified in the
 * Link response header"). Absent when there is no next page.
 */
function nextCommentId(link: string | undefined): string | undefined {
  if (!link) return undefined
  for (const part of link.split(',')) {
    const m = part.match(/<([^>]*)>\s*;(.*)$/)
    if (!m || !/rel="?next"?/i.test(m[2]!)) continue
    try {
      const id = new URL(m[1]!, 'https://api.tracker.yandex.net').searchParams.get('id')
      return id ?? undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * OpenProject adapter — OpenProject REST API v3 (HAL+JSON) → canonical
 * projects schema.
 *
 * Model notes:
 * - OpenProject is per-tenant (self-hosted or dedicated cloud). The instance
 *   origin is captured at OAuth time in `credentials.extra.instanceUrl`; a
 *   deployment default may also be passed to the constructor.
 * - Work packages are the task model; their hierarchy is a single
 *   `parent` link → `Task.parentId`.
 * - Comments are `Activity::Comment` activities on a work package.
 * - There is NO workspace and NO tag/label concept in OpenProject, so
 *   `listTags` / `getTag` / `listWorkspaces` / `getWorkspace` are not
 *   implemented and resolve to 501 at the dispatch layer.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: tag — OpenProject has no tag/label resource; the v3 API
 *   exposes no /tags or /labels endpoint. The community labels epic
 *   (work_packages/32181) has not shipped as of v17.
 * Unavailable: workspace — OpenProject v17 introduced "workspace" as an
 *   umbrella term for Portfolio/Program/Project but there is no
 *   GET /api/v3/workspaces list endpoint; the docs state "there is no
 *   actual workspace resource in OpenProject." Projects are already
 *   mapped to the canonical Project resource.
 */
import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { User } from '../../schema/user'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as openProjectExchange,
  refreshCredentials as openProjectRefresh,
} from './auth'
import { OpenProjectClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'
import { verifyOpenProjectWebhook, parseOpenProjectWebhookEvents } from './webhook'

import { transformProject, type RawOpenProjectProject } from './transform/project'
import { transformTask, type RawOpenProjectWorkPackage } from './transform/task'
import { transformComment, isComment, type RawOpenProjectActivity } from './transform/comment'
import { transformUser, type RawOpenProjectUser } from './transform/user'

export interface OpenprojectAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /**
   * Deployment-wide instance URL, e.g. `https://acme.openproject.com`.
   * Optional: the instance is normally the customer's, collected at connect
   * time (`oauthFields`) and read back from `credentials.extra.instanceUrl`.
   */
  instanceUrl?: string
  scopes?: string[]
}

export class OpenprojectAdapter implements ProjectsAdapter {
  readonly platform = 'openproject'
  readonly version = '0.1.0'
  /**
   * The default of the instance's API "maximum page size"; an instance set
   * lower answers with its own `pageSize`, which is reported.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private instanceUrl: string | undefined
  private scopes: string[]

  constructor(config: OpenprojectAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.instanceUrl = config.instanceUrl
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  /**
   * OAuth and API v3 live on the customer's own OpenProject instance, which
   * deployment config cannot know. Asked for before the redirect.
   */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'instanceUrl',
        label: 'OpenProject instance URL',
        type: 'url',
        required: true,
        placeholder: 'https://acme.openproject.com',
        helpText:
          'The address of your OpenProject instance, including any sub-path it is installed under. It must be reachable over https.',
      },
    ]
  }

  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    return buildAuthUrl(
      inputs?.['instanceUrl'] ?? this.instanceUrl,
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return openProjectExchange(
      this.instanceUrl,
      code,
      redirectUri,
      this.clientId,
      this.clientSecret,
    )
  }

  /** Exchange on the customer's instance and remember it with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return openProjectExchange(
      inputs['instanceUrl'] ?? this.instanceUrl,
      code,
      redirectUri,
      this.clientId,
      this.clientSecret,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return openProjectRefresh(this.instanceUrl, credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyOpenProjectWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseOpenProjectWebhookEvents(payload)
  }

  private client(credentials: Credentials): OpenProjectClient {
    return new OpenProjectClient(credentials, this.instanceUrl)
  }

  /**
   * The caller's page of an offset-paginated collection
   * (https://www.openproject.org/docs/api/collections/): `offset` is "The page
   * number that is requested from paginated collection" (1-based, so it is
   * `page` itself), `pageSize` the "Amount of elements that a response will
   * hold", and `total` "The total amount of elements available in the
   * collection". The instance caps `pageSize` at its configurable maximum
   * page size and echoes the size it used, which is reported when smaller.
   */
  private async pagedCollection<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const page =
      typeof params.page === 'number' && Number.isFinite(params.page) && params.page >= 1
        ? Math.floor(params.page)
        : 1
    const requested = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const data = await this.client(credentials).getCollectionPage<T>(path, {
      offset: page,
      pageSize: requested,
    })
    const elements = data._embedded?.elements ?? []
    const served =
      typeof data.pageSize === 'number' && data.pageSize >= 1 && data.pageSize < requested
        ? data.pageSize
        : requested
    const hasMore =
      typeof data.total === 'number'
        ? page * served < data.total
        : Boolean(data._links?.nextByOffset?.href)
    reportUpstreamPage(params, {
      hasMore,
      ...(typeof data.total === 'number' ? { totalCount: data.total } : {}),
      ...(params.limit !== undefined && served < params.limit ? { pageSize: served } : {}),
    })
    return elements
  }

  // ── Projects ─────────────────────────────────────────────────────────────
  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const elements = await this.pagedCollection<RawOpenProjectProject>(
      credentials,
      '/projects',
      params,
    )
    return elements.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const raw = await this.client(credentials).get<RawOpenProjectProject>(`/projects/${id}`)
    return transformProject(raw)
  }

  // ── Tasks (work packages) ────────────────────────────────────────────────
  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const elements = await this.pagedCollection<RawOpenProjectWorkPackage>(
      credentials,
      `/projects/${projectId}/work_packages`,
      params,
    )
    return elements.map((wp) => transformTask(wp, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const raw = await this.client(credentials).get<RawOpenProjectWorkPackage>(
      `/work_packages/${id}`,
    )
    return transformTask(raw)
  }

  // ── Comments (work-package activities) ────────────────────────────────────
  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    // GET /work_packages/{id}/activities documents no query parameters and
    // answers every activity at once ("Some collections feature no pagination
    // at all, meaning they will always return all elements."), so the
    // comments filtered from it are the whole collection, paged here.
    const elements = await this.client(credentials).getCollection<RawOpenProjectActivity>(
      `/work_packages/${taskId}/activities`,
    )
    return pageLocally(
      elements.filter(isComment).map((a) => transformComment(a, taskId)),
      params,
    )
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const raw = await this.client(credentials).get<RawOpenProjectActivity>(`/activities/${id}`)
    return transformComment(raw)
  }

  // ── Users ────────────────────────────────────────────────────────────────
  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const elements = await this.pagedCollection<RawOpenProjectUser>(credentials, '/users', params)
    return elements.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawOpenProjectUser>(`/users/${id}`)
    return transformUser(raw)
  }
}

/**
 * Document360 adapter for the customer-support vertical.
 *
 * Document360 is a knowledge-base platform. API concept mappings:
 *   Article         → Ticket   (knowledge-base article; status: draft/published)
 *   Reader          → Contact  (portal user who consumes the KB)
 *   Team Account    → User     (staff/editor who manages the KB)
 *   Category        → Tag      (article category tree)
 *   Project Version → Team     (versioned knowledge-base grouping)
 *
 * Unsupported: Messages (no ticket-comment API), Macros (no canned-reply concept).
 * Webhooks: Document360 does emit webhooks but provides no documented HMAC signing,
 * so verifyWebhook / parseWebhookEvents are not implemented.
 *
 * Auth: static API token in `api_token` header.
 * Base URL: https://apihub.document360.io/v2
 *
 * Docs: https://apidocs.document360.com/apidocs
 */
import {
  pageLocally,
  pageOffset,
  reportUpstreamPage,
  type Credentials,
  type CredentialField,
  type QueryParams,
} from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'
import type { Team } from '../../schema/team'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { Document360Client } from './client'
import { DEFAULT_HITS_PER_PAGE, TEAMS_DEFAULT_TAKE, DEFAULT_READER_OFFSET } from './constants'

import { transformTicket, type RawDocument360Article } from './transform/ticket'
import { transformContact, type RawDocument360Reader } from './transform/contact'
import {
  transformUser,
  transformUserDetail,
  type RawDocument360TeamMember,
  type RawDocument360TeamMemberDetail,
} from './transform/user'
import { transformTag, type RawDocument360Category } from './transform/tag'
import { transformTeam, type RawDocument360ProjectVersion } from './transform/team'

// ── Response envelope shapes ──────────────────────────────────────────────────

interface ArticlesListResponse {
  data?: RawDocument360Article[]
  pagination?: { page?: number; hits_per_page?: number; has_more?: boolean; result_count?: number }
  success?: boolean
}

interface ArticleResponse {
  data?: RawDocument360Article
  success?: boolean
}

interface ReadersResponse {
  data?: RawDocument360Reader[]
  success?: boolean
}

interface ReaderResponse {
  data?: RawDocument360Reader
  success?: boolean
}

/** GET /v2/Teams body: TeamAccountSummaryCustomerListCustomerApiResponse. */
interface TeamsBody {
  result?: RawDocument360TeamMember[] | null
  success?: boolean
  errors?: unknown[] | null
}

/** GET /v2/Teams/{userId} body: CompleteUserInfoCustomerCustomerApiResponse. */
interface TeamMemberBody {
  result?: RawDocument360TeamMemberDetail | null
  success?: boolean
  errors?: unknown[] | null
}

interface CategoriesResponse {
  data?: RawDocument360Category[]
  success?: boolean
}

/** GET /v2/ProjectVersions body: GetProjectVersionsResponse. */
interface ProjectVersionsBody {
  data?: RawDocument360ProjectVersion[] | null
  success?: boolean
  errors?: unknown[] | null
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

/**
 * The envelope's own failure flag. Every v2 body documents `success`: "A value of
 * true signifies that the request was successfully processed, while false
 * indicates a failure or error occurred", with the reasons in `errors`. The
 * payload fields (`result`, `data`) are documented as nullable and "Populated
 * when ... success is `true`", so a failed body must not read as an empty list.
 */
function assertSucceeded(
  path: string,
  body: { success?: boolean; errors?: unknown[] | null },
): void {
  if (body.success === false) {
    throw new Error(`document360 ${path} failed: ${JSON.stringify(body.errors ?? [])}`)
  }
}

/**
 * GET /v2/Teams/{userId} documents two unknown-id answers besides a null
 * `result`: 404 "The requested resource was not found, or the supplied
 * identifier does not exist in the project", and the 400 example "Teams -
 * Invalid User Id" whose `errors[].description` is "The user id does not
 * exist.". Both become NOT_FOUND; any other 400 stays the validation error it is.
 */
function isUnknownUser(err: unknown): boolean {
  const res = (err as { response?: { status?: number; data?: unknown } }).response
  if (res?.status === 404) return true
  if (res?.status !== 400) return false
  const errors = (res.data as { errors?: Array<{ description?: unknown }> | null } | undefined)
    ?.errors
  return (errors ?? []).some((e) => e?.description === 'The user id does not exist.')
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class Document360Adapter implements CustomerSupportAdapter {
  readonly platform = 'document360'
  readonly version = '0.1.0'

  // Config is unused for API-key adapters but required by the factory pattern
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(_config?: Record<string, any>) {}

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return adapterExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('document360 uses static API token auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): Document360Client {
    return new Document360Client(credentials)
  }

  // ── Tickets → Articles ──────────────────────────────────────────────────────

  /**
   * Lists articles within a project version.
   * Requires `params.extra.projectVersionId` to be set; returns [] if absent.
   * Pagination: `page` (0-based) + `hitsPerPage`.
   */
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const extra = params['extra'] as Record<string, unknown> | undefined
    const projectVersionId = params['projectVersionId'] ?? extra?.['projectVersionId']
    if (!projectVersionId) return []

    const res = await this.client(credentials).get<ArticlesListResponse>(
      `/ProjectVersions/${String(projectVersionId)}/articles`,
      {
        page: params['page'] ?? 0,
        hitsPerPage: params.limit ?? DEFAULT_HITS_PER_PAGE,
        ...(params['langCode'] ? { langCode: String(params['langCode']) } : {}),
      },
    )
    return (res.data?.data ?? []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const langCode = 'en'
    const res = await this.client(credentials).get<ArticleResponse>(
      `/Articles/${encodeURIComponent(id)}/${langCode}`,
    )
    if (!res.data?.data) throw new Error(`document360 article ${id} not found`)
    return transformTicket(res.data.data)
  }

  // ── Contacts → Readers ─────────────────────────────────────────────────────

  /**
   * Lists portal readers (end-users). Pagination via `offSet` (1-based page index).
   * Each page returns up to 5000 records.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<ReadersResponse>('/Readers', {
      offSet: params['offSet'] ?? DEFAULT_READER_OFFSET,
      ...(params['searchEmail'] ? { searchEmail: String(params['searchEmail']) } : {}),
    })
    return (res.data?.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<ReaderResponse>(
      `/Readers/${encodeURIComponent(id)}`,
    )
    if (!res.data?.data) throw new Error(`document360 reader ${id} not found`)
    return transformContact(res.data.data)
  }

  // ── Users → Team Accounts ──────────────────────────────────────────────────

  /**
   * GET /v2/Teams — "Uses skip/take pagination — supply `skip = take * (page - 1)`
   * to navigate through pages." `take`: "Number of records to return per page.
   * Default: 20." No maximum is documented, so the caller's limit is sent as is.
   * The body is `{ result: TeamAccountSummaryCustomer[] }` with no count, so a
   * page shorter than `take` is the only end signal.
   */
  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const take = params.limit ?? TEAMS_DEFAULT_TAKE
    const body = await this.client(credentials).getBody<TeamsBody>('/Teams', {
      skip: pageOffset(params, take),
      take,
    })
    assertSucceeded('GET /v2/Teams', body)
    const rows = body.result ?? []
    if (rows.length < take) reportUpstreamPage(params, { hasMore: false })
    return rows.map(transformUser)
  }

  /** GET /v2/Teams/{userId} — "Gets complete team account details by ID". */
  async getUser(credentials: Credentials, id: string): Promise<User> {
    let body: TeamMemberBody
    try {
      body = await this.client(credentials).getBody<TeamMemberBody>(
        `/Teams/${encodeURIComponent(id)}`,
      )
    } catch (err) {
      if (isUnknownUser(err)) throw notFound(`document360 team account ${id} not found`)
      throw err
    }
    assertSucceeded('GET /v2/Teams/{userId}', body)
    if (!body.result) throw notFound(`document360 team account ${id} not found`)
    return transformUserDetail(body.result)
  }

  // ── Tags → Categories ──────────────────────────────────────────────────────

  /**
   * Lists categories within a project version.
   * Requires `params.projectVersionId`; returns [] if absent.
   */
  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const extra = params['extra'] as Record<string, unknown> | undefined
    const projectVersionId = params['projectVersionId'] ?? extra?.['projectVersionId']
    if (!projectVersionId) return []

    const res = await this.client(credentials).get<CategoriesResponse>(
      `/ProjectVersions/${String(projectVersionId)}/categories`,
      {
        ...(params['langCode'] ? { langCode: String(params['langCode']) } : {}),
      },
    )
    return (res.data?.data ?? []).map(transformTag)
  }

  // ── Teams → Project Versions ───────────────────────────────────────────────

  /**
   * GET /v2/ProjectVersions — "Gets the list of workspaces (project versions) in
   * the project"; the operation declares no parameters, so the body's `data`
   * array is the whole collection, paged locally.
   */
  private async projectVersions(credentials: Credentials): Promise<Team[]> {
    const body = await this.client(credentials).getBody<ProjectVersionsBody>('/ProjectVersions')
    assertSucceeded('GET /v2/ProjectVersions', body)
    return (body.data ?? []).map(transformTeam)
  }

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    return pageLocally(await this.projectVersions(credentials), params)
  }

  /**
   * The v2 spec documents no GET /v2/ProjectVersions/{id} (only
   * /{projectVersionId}/articles, /categories, /apireferences and the
   * /{langCode} search), so a workspace is read back from the documented list.
   */
  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const team = (await this.projectVersions(credentials)).find((t) => t.id === id)
    if (!team) throw notFound(`document360 project version ${id} not found`)
    return team
  }
}

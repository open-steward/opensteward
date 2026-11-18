/**
 * Huly adapter for the projects vertical.
 *
 * Huly is an open-source all-in-one project management platform. Its REST
 * API is served by the workspace's transactor at `<transactor>/api/v1`, with
 * a workspace API token as the Bearer and the workspace UUID in the path
 * (see client.ts and auth.ts for the first-party sources).
 *
 * Resources mapped to canonical schema:
 *   Workspace → the connection's workspace (the token is bound to one)
 *   Project   → tracker:class:Project spaces
 *   Task      → tracker:class:Issue documents
 *   Comment   → chunter:class:ChatMessage attached to issues
 *   User      → contact:mixin:Employee (workspace members)
 *
 * Every user reference is emitted as a Person `_id`, the id a User row has:
 * Comment.authorId resolves `createdBy` (a PersonId) through
 * `contact:class:SocialIdentity`, and Project.ownerId resolves `owners[0]`
 * (an AccountUuid) through `BasePerson.personUuid`, one `$in` lookup per page.
 *
 * Tags are not mapped; listTags/getTag auto-501 via the optional interface.
 *
 * ## Paging
 *
 * `find-all` takes `FindOptions` — huly.core packages/core/src/storage.ts:
 * `limit?: number; sort?: SortingQuery<T>; lookup?; projection?;
 * associations?; total?: boolean; showArchived?: boolean` — and has no
 * offset. Every list is therefore walked by key through `pageByCursor`:
 * sorted by `modifiedOn` ascending (`Doc.modifiedOn: Timestamp`, required on
 * every document), each next page asks for `modifiedOn: { $gte: <last> }`
 * and excludes the ids already served at that same timestamp with
 * `_id: { $nin: [...] }` (`QuerySelector`: `$gte?: T extends number ?
 * number : never`, `$nin?: T[]`). A page shorter than the limit is the end.
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  CREDENTIAL_FIELDS,
  exchangeCode as hulyExchange,
  exchangeCredentials as hulyExchangeCredentials,
  refreshCredentials as hulyRefresh,
} from './auth'
import {
  apiBaseUrlOf,
  HulyClient,
  workspaceIdOf,
  type HulyDoc,
  type HulyFindOptions,
} from './client'
import {
  CLASS_CHAT_MESSAGE,
  CLASS_EMPLOYEE,
  CLASS_ISSUE,
  CLASS_PROJECT,
  CLASS_SOCIAL_IDENTITY,
  DEFAULT_PAGE_SIZE,
  SORT_ASCENDING,
} from './constants'

import { transformProject, type RawHulyProject } from './transform/project'
import { transformTask, type RawHulyTask } from './transform/task'
import { transformComment, type RawHulyComment } from './transform/comment'
import { transformWorkspace } from './transform/workspace'
import { transformUser, type RawHulyUser } from './transform/user'

/** Configuration for the HulyAdapter (api_key model — no OAuth required). */
export interface HulyAdapterConfig {
  /** Unused for api_key auth — kept for interface parity. */
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

/** Where the next page starts: at `after`, minus the ids already served there. */
export interface HulyKeyCursor {
  after: number
  seen: string[]
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

export class HulyAdapter implements ProjectsAdapter {
  readonly platform = 'huly'
  readonly version = '0.2.0'

  constructor(_config: HulyAdapterConfig = {}) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  credentialFields = () => CREDENTIAL_FIELDS
  exchangeCredentials = hulyExchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string): Promise<Credentials> {
    return hulyExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return hulyRefresh(credentials)
  }

  // ── Paging ───────────────────────────────────────────────────────────────

  /**
   * One caller page of `_class` matching `filter`, walked by key (see the
   * file header). The caller's limit is sent as `options.limit`; Huly
   * documents no maximum for it.
   */
  private async listPage<T extends HulyDoc>(
    credentials: Credentials,
    collection: string,
    _class: string,
    filter: Record<string, string>,
    params: QueryParams,
    extraOptions: HulyFindOptions = {},
  ): Promise<T[]> {
    const client = new HulyClient(credentials)
    const limit =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_SIZE
    const key = cursorPagerKey(
      connectionScope(`${client.baseUrl}#${client.workspace}`, credentials),
      collection,
      { ...filter, limit },
    )
    const { items, hasMore } = await pageByCursor<T, HulyKeyCursor>(
      key,
      params.page,
      async (cursor) => {
        const query: Record<string, unknown> = { ...filter }
        if (cursor) {
          query['modifiedOn'] = { $gte: cursor.after }
          if (cursor.seen.length > 0) query['_id'] = { $nin: cursor.seen }
        }
        const docs = await client.findAll<T>(_class, query, {
          ...extraOptions,
          limit,
          sort: { modifiedOn: SORT_ASCENDING },
        })
        if (docs.length < limit) return { items: docs, next: null }
        const last = docs[docs.length - 1]!.modifiedOn
        if (typeof last !== 'number') {
          throw new Error(`Huly ${_class} document has no numeric modifiedOn`)
        }
        const tie = docs.filter((d) => d.modifiedOn === last).map((d) => d._id)
        const seen = cursor && cursor.after === last ? [...cursor.seen, ...tie] : tie
        return { items: docs, next: { after: last, seen } }
      },
    )
    reportUpstreamPage(params, { hasMore })
    return items
  }

  /**
   * PersonId (`Doc.createdBy`) → Person `_id`, through the
   * `contact:class:SocialIdentity` documents whose `_id` is the PersonId and
   * whose `attachedTo` is the Person (contact plugin `interface SocialIdentity
   * extends SocialId, AttachedDoc { _id: Ref<this> & PersonId; attachedTo:
   * Ref<Person> }`). One request for the distinct ids of a page.
   */
  private async personsBySocialId(
    credentials: Credentials,
    personIds: string[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(personIds)]
    const out = new Map<string, string>()
    if (ids.length === 0) return out
    const docs = await new HulyClient(credentials).findAll<HulyDoc & { attachedTo?: string }>(
      CLASS_SOCIAL_IDENTITY,
      { _id: { $in: ids } },
      { limit: ids.length, showArchived: true },
    )
    for (const d of docs) if (typeof d.attachedTo === 'string') out.set(d._id, d.attachedTo)
    return out
  }

  /**
   * AccountUuid (`Space.owners[]`) → Person `_id` of the workspace member
   * whose `BasePerson.personUuid` it is (`type AccountUuid = PersonUuid & ...`).
   * One request for the distinct uuids of a page. An owner with no member
   * Person is left unresolved: `Project.ownerId` is optional.
   */
  private async personsByAccount(
    credentials: Credentials,
    accounts: string[],
  ): Promise<Map<string, string>> {
    const uuids = [...new Set(accounts)]
    const out = new Map<string, string>()
    if (uuids.length === 0) return out
    const docs = await new HulyClient(credentials).findAll<HulyDoc & { personUuid?: string }>(
      CLASS_EMPLOYEE,
      { personUuid: { $in: uuids } },
      { limit: uuids.length, showArchived: true },
    )
    for (const d of docs) if (typeof d.personUuid === 'string') out.set(d.personUuid, d._id)
    return out
  }

  private async toComments(
    credentials: Credentials,
    docs: RawHulyComment[],
    taskId?: string,
  ): Promise<Comment[]> {
    const authors = await this.personsBySocialId(
      credentials,
      docs.map((d) => d.createdBy).filter((v): v is string => typeof v === 'string' && v !== ''),
    )
    return docs.map((d) => {
      const author = d.createdBy ? authors.get(d.createdBy) : undefined
      if (!author) {
        throw new Error(
          `Huly message ${d._id}: createdBy ${String(d.createdBy)} resolves to no contact:class:SocialIdentity`,
        )
      }
      return transformComment(d, author, taskId)
    })
  }

  private async toProjects(credentials: Credentials, docs: RawHulyProject[]): Promise<Project[]> {
    const ws = workspaceIdOf(credentials)
    const owners = await this.personsByAccount(
      credentials,
      docs.map((d) => d.owners?.[0]).filter((v): v is string => typeof v === 'string' && v !== ''),
    )
    return docs.map((d) =>
      transformProject(d, ws, d.owners?.[0] ? owners.get(d.owners[0]) : undefined),
    )
  }

  /** The one document of `_class` with `_id`, or a 404. */
  private async findOne<T extends HulyDoc>(
    credentials: Credentials,
    _class: string,
    id: string,
  ): Promise<T> {
    const docs = await new HulyClient(credentials).findAll<T>(_class, { _id: id }, { limit: 1 })
    const doc = docs[0]
    if (!doc) throw notFound(`Huly ${_class} ${id} not found`)
    return doc
  }

  // ── Workspaces ───────────────────────────────────────────────────────────

  /**
   * The connection's workspace. A Huly API token reaches exactly one
   * workspace, so this one row is the whole collection and is paged locally
   * without a request.
   */
  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    apiBaseUrlOf(credentials)
    return pageLocally([transformWorkspace(workspaceIdOf(credentials))], params)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    apiBaseUrlOf(credentials)
    const ws = workspaceIdOf(credentials)
    if (id !== ws) throw notFound(`Huly workspace ${id} is not this connection's workspace`)
    return transformWorkspace(ws)
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  /**
   * Includes archived projects: without `showArchived` a query with no
   * string `_id` or `space` hides them (storage.ts `shouldShowArchived`).
   */
  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const docs = await this.listPage<RawHulyProject>(
      credentials,
      'projects',
      CLASS_PROJECT,
      {},
      params,
      {
        showArchived: true,
      },
    )
    return this.toProjects(credentials, docs)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const doc = await this.findOne<RawHulyProject>(credentials, CLASS_PROJECT, id)
    return (await this.toProjects(credentials, [doc]))[0]!
  }

  // ── Tasks (Issues) ───────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const docs = await this.listPage<RawHulyTask>(
      credentials,
      'tasks',
      CLASS_ISSUE,
      { space: projectId },
      params,
    )
    return docs.map((d) => transformTask(d))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    return transformTask(await this.findOne<RawHulyTask>(credentials, CLASS_ISSUE, id))
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  /**
   * Includes messages on issues of archived projects: a query on
   * `attachedTo` alone has no string `_id` or `space`, so without
   * `showArchived` the server drops documents whose space is archived
   * (huly.core storage.ts `shouldShowArchived`; huly.server
   * spaceSecurity.ts `unfilteredRes.filter((p) => this.spacesMap.get(p)?.archived !== true)`).
   */
  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const docs = await this.listPage<RawHulyComment>(
      credentials,
      'comments',
      CLASS_CHAT_MESSAGE,
      { attachedTo: taskId },
      params,
      { showArchived: true },
    )
    return this.toComments(credentials, docs, taskId)
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const doc = await this.findOne<RawHulyComment>(credentials, CLASS_CHAT_MESSAGE, id)
    return (await this.toComments(credentials, [doc]))[0]!
  }

  // ── Users ────────────────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const ws = workspaceIdOf(credentials)
    if (workspaceId && workspaceId !== ws) {
      throw notFound(`Huly workspace ${workspaceId} is not this connection's workspace`)
    }
    // showArchived for the same reason as listComments: no string _id/space.
    const docs = await this.listPage<RawHulyUser>(
      credentials,
      'users',
      CLASS_EMPLOYEE,
      {},
      params,
      {
        showArchived: true,
      },
    )
    return docs.map((d) => transformUser(d, ws))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const doc = await this.findOne<RawHulyUser>(credentials, CLASS_EMPLOYEE, id)
    return transformUser(doc, workspaceIdOf(credentials))
  }
}

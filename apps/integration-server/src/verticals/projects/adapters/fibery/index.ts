/**
 * Fibery adapter for the projects vertical.
 *
 * Fibery is a dynamic workspace tool. All data lives in a single command-based
 * POST endpoint: https://{account}.fibery.io/api/commands
 *
 * The auth model is api_key: a static personal token passed as
 * `Authorization: Token <token>`. The account subdomain must be supplied in
 * `credentials.extra.account` (set at Connect Link time).
 *
 * Mapping to the canonical schema:
 *   Workspace  → one workspace per Fibery account (from fibery.schema/query)
 *   Project    → each user-defined database (entity type) in the schema
 *   Task       → entities in a given database (fibery.entity/query)
 *   User       → fibery/user entries (fibery.entity/query on "fibery/user")
 *   Comment    → entities in the built-in "comments/comment" database,
 *                filtered by parent entity ID via comments/parent field.
 *                Body text is omitted (requires a second /api/documents call);
 *                the document secret is surfaced in metadata.documentSecret.
 *
 * Docs: https://developers.fibery.com/
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: tag — Fibery has no first-class tag/label entity; single-select
 *              fields are private enum databases, not a taggable concept.
 */
import {
  callerLimit,
  pageLocally,
  pageOffset,
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
  exchangeCode as fiberyExchangeCode,
  refreshCredentials as fiberyRefresh,
} from './auth'
import { FiberyClient, type FiberyTypeSchema } from './client'
import {
  DEFAULT_PAGE_SIZE,
  FIELD_ID,
  FIELD_PUBLIC_ID,
  FIELD_CREATION_DATE,
  FIELD_MODIFICATION_DATE,
  FIELD_CREATED_BY,
  USER_TYPE,
  USER_FIELD_NAME,
  USER_FIELD_EMAIL,
  COMMENT_TYPE,
} from './constants'

import { transformProject, type RawFiberyType } from './transform/project'
import { transformTask, type FiberyTaskFields, type RawFiberyEntity } from './transform/task'
import { transformWorkspace, type RawFiberyWorkspace } from './transform/workspace'
import { transformUser, type RawFiberyUser } from './transform/user'
import { transformComment, type RawFiberyComment } from './transform/comment'

/** Configuration for the FiberyAdapter (api_key model — no OAuth required). */
export interface FiberyAdapterConfig {
  /** Unused for api_key auth, kept for interface parity. */
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

export class FiberyAdapter implements ProjectsAdapter {
  readonly platform = 'fibery'
  readonly version = '0.1.0'

  constructor(_config: FiberyAdapterConfig = {}) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return fiberyExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return fiberyRefresh(credentials)
  }

  // ── Client factory ───────────────────────────────────────────────────────

  private client(credentials: Credentials): FiberyClient {
    return new FiberyClient(credentials)
  }

  // ── Workspaces ───────────────────────────────────────────────────────────

  /**
   * Returns an array with exactly one workspace (the account-level workspace).
   * The schema query returns the workspace UUID and metadata.
   */
  async listWorkspaces(credentials: Credentials, _params: QueryParams): Promise<Workspace[]> {
    const c = this.client(credentials)
    const schema = await c.querySchema()
    const raw: RawFiberyWorkspace = {
      'fibery/id': schema['fibery/id'],
      'fibery/meta': schema['fibery/meta'] as Record<string, unknown> | undefined,
      account: c.account,
      typeCount: schema['fibery/types']?.length,
    }
    return [transformWorkspace(raw)]
  }

  async getWorkspace(credentials: Credentials, _id: string): Promise<Workspace> {
    const [ws] = await this.listWorkspaces(credentials, {})
    if (!ws) throw new Error('Fibery workspace not found')
    return ws
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  /**
   * Each domain Database in the schema is a Project. Databases
   * (https://developers.fibery.com/guides/http-api/databases): meta
   * `fibery/domain?` "Domain Databases are available as cards on Views",
   * default false; auxiliary Databases (enums, user favourites and the like)
   * are "hidden from Workspace Map screen". `fibery.schema/query` takes no
   * paging parameter and returns every Database at once, so the caller's page
   * is sliced locally from the whole list.
   */
  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const schema = await this.client(credentials).querySchema()
    const workspaceId = schema['fibery/id']
    const domains = (schema['fibery/types'] ?? []).filter(isDomainDatabase)
    return pageLocally(domains, params).map((t) =>
      transformProject(t as unknown as RawFiberyType, workspaceId),
    )
  }

  /**
   * Look up a project (domain Database) by its `fibery/id` in the schema. Only
   * the Databases listProjects returns are Projects, so an auxiliary one is
   * not found here either.
   */
  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const schema = await this.client(credentials).querySchema()
    const found = domainDatabase(schema['fibery/types'], id)
    if (!found) throw new Error(`Fibery project (database) ${id} not found`)
    return transformProject(found as unknown as RawFiberyType, schema['fibery/id'])
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  /**
   * One caller page of the Entities in the Database whose `fibery/id` is
   * `projectId`. The schema gives the Database's name (`q/from`) and its
   * Fields, from which the query selects only documented ones (see
   * {@link taskQuery}). Paged by `q/offset` / `q/limit` in `fibery/id` order,
   * like listUsers (see FiberyClient.queryPage).
   */
  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const c = this.client(credentials)
    const schema = await c.querySchema()
    const dbType = domainDatabase(schema['fibery/types'], projectId)
    if (!dbType) throw new Error(`Fibery database ${projectId} not found in schema`)

    const { query, fields } = taskQuery(dbType)
    const limit = callerLimit(params)
    const { rows, hasMore } = await c.queryPage(
      { ...query, 'q/order-by': ORDER_BY_ID },
      {},
      { limit, offset: pageOffset(params, limit) },
    )
    reportUpstreamPage(params, { hasMore })
    return rows.map((e) => transformTask(e as RawFiberyEntity, projectId, fields))
  }

  /**
   * Get one Entity by its `fibery/id`, the id listTasks returns. An Entity
   * query needs its Database (`q/from` is required), which the bare id does
   * not name, so the id is looked up in every domain Database in one POST:
   * Overview (https://developers.fibery.com/guides/http-api/overview) "The
   * endpoint works with batches of commands. ... You'll get an array back
   * too." The older `{databaseId}:{entityId}` form queries that Database only.
   * Each command in the batch succeeds or fails on its own (Response envelope,
   * https://developers.fibery.com/api-reference/response-envelope: "When
   * `success` is `false`, `result` holds the error"), so one Database the token
   * cannot read does not hide the entity in another; a failure is thrown only
   * when no Database returned the entity.
   */
  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const sep = id.indexOf(':')
    const dbTypeId = sep === -1 ? undefined : id.slice(0, sep)
    const entityId = sep === -1 ? id : id.slice(sep + 1)

    const c = this.client(credentials)
    const schema = await c.querySchema()
    const types = schema['fibery/types'] ?? []
    const candidates =
      dbTypeId === undefined
        ? types.filter((t) => isDomainDatabase(t) && titleFieldOf(t) !== undefined)
        : types.filter((t) => isDomainDatabase(t) && t['fibery/id'] === dbTypeId)
    if (dbTypeId !== undefined && candidates.length === 0)
      throw new Error(`Fibery database ${dbTypeId} not found`)

    const lookups = candidates.map((t) => ({ type: t, ...taskQuery(t) }))
    const results = await c.commands<Record<string, unknown>[]>(
      lookups.map(({ query }) => ({
        command: 'fibery.entity/query',
        args: {
          query: { ...query, 'q/where': ['=', [FIELD_ID], '$id'], 'q/limit': 1 },
          params: { $id: entityId },
        },
      })),
    )
    let failure: string | undefined
    for (const [i, res] of results.entries()) {
      if (!res?.success) {
        const err = res?.result as { message?: string } | undefined
        failure ??= err?.message ?? 'no error message'
        continue
      }
      const [entity] = res.result
      const lookup = lookups[i]
      if (entity && lookup)
        return transformTask(entity as RawFiberyEntity, lookup.type['fibery/id'], lookup.fields)
    }
    if (failure !== undefined)
      throw new Error(`Fibery command fibery.entity/query failed: ${failure}`)
    throw new Error(`Fibery entity ${entityId} not found`)
  }

  // ── Users ────────────────────────────────────────────────────────────────

  /**
   * List all users in the workspace. Fibery users are queried via the built-in
   * `fibery/user` database.
   */
  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const c = this.client(credentials)
    const limit = (params['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE
    const cursorId = params['cursor'] as string | undefined
    const select = [FIELD_ID, USER_FIELD_NAME, USER_FIELD_EMAIL]

    if (cursorId === undefined) {
      // One caller page per request: q/offset skips the pages before it, and
      // after a full page a one-row look-ahead at offset + limit says whether
      // another follows (see FiberyClient.queryPage).
      const { rows, hasMore } = await c.queryPage(
        { 'q/from': USER_TYPE, 'q/select': select, 'q/order-by': [[FIELD_ID, 'q/asc']] },
        {},
        { limit, offset: pageOffset(params, limit) },
      )
      reportUpstreamPage(params, { hasMore })
      return rows.map((e) => transformUser(e as RawFiberyUser, workspaceId))
    }

    const entities = await c.queryEntities(USER_TYPE, select, {
      limit,
      cursorId,
    })

    return entities.map((e) => transformUser(e as RawFiberyUser, workspaceId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const c = this.client(credentials)
    const schema = await c.querySchema()
    const workspaceId = schema['fibery/id']

    const [entity] = await c.command<RawFiberyUser[]>({
      command: 'fibery.entity/query',
      args: {
        query: {
          'q/from': USER_TYPE,
          'q/select': [FIELD_ID, USER_FIELD_NAME, USER_FIELD_EMAIL],
          'q/where': ['=', [FIELD_ID], '$_id'],
          'q/limit': 1,
        },
        params: { $_id: id },
      },
    })

    if (!entity) throw new Error(`Fibery user ${id} not found`)
    return transformUser(entity, workspaceId)
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  /**
   * List comments attached to a given task (parent entity). Comments are
   * entities in the built-in `comments/comment` database. We filter by the
   * `comments/parent` relation field using the parent entity's `fibery/id`.
   *
   * Note: comment body text is stored in a collaborative document and is NOT
   * fetched here (would require N+1 calls to /api/documents/{secret}). The
   * document secret is surfaced via `metadata.documentSecret` if callers need it.
   *
   * Docs: https://developers.fibery.com/guides/http-api/rich-text-and-comments
   */
  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const c = this.client(credentials)
    const limit = (params['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE

    const select: (string | Record<string, unknown>)[] = [
      FIELD_ID,
      'fibery/public-id',
      'fibery/creation-date',
      { 'fibery/created-by': [FIELD_ID, USER_FIELD_NAME] },
      'comment/document-secret',
      { 'comments/parent': [FIELD_ID] },
    ]

    // Use command directly so we can pass $parentId as a query param.
    // queryEntities does not support caller-supplied params binding.
    // One caller page per request: q/offset skips the pages before it, and
    // after a full page a one-row look-ahead at offset + limit says whether
    // another follows (see FiberyClient.queryPage).
    const { rows, hasMore } = await c.queryPage(
      {
        'q/from': COMMENT_TYPE,
        'q/select': select,
        'q/where': ['=', ['comments/parent', FIELD_ID], '$parentId'],
        'q/order-by': [[FIELD_ID, 'q/asc']],
      },
      { $parentId: taskId },
      { limit, offset: pageOffset(params, limit) },
    )
    reportUpstreamPage(params, { hasMore })

    return rows.map((e) => transformComment(e as RawFiberyComment, taskId))
  }

  /**
   * Get a single comment by its `fibery/id`.
   */
  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const c = this.client(credentials)

    const select: (string | Record<string, unknown>)[] = [
      FIELD_ID,
      'fibery/public-id',
      'fibery/creation-date',
      { 'fibery/created-by': [FIELD_ID, USER_FIELD_NAME] },
      'comment/document-secret',
      { 'comments/parent': [FIELD_ID] },
    ]

    const [entity] = await c.command<RawFiberyComment[]>({
      command: 'fibery.entity/query',
      args: {
        query: {
          'q/from': COMMENT_TYPE,
          'q/select': select,
          'q/where': ['=', [FIELD_ID], '$_id'],
          'q/limit': 1,
        },
        params: { $_id: id },
      },
    })

    if (!entity) throw new Error(`Fibery comment ${id} not found`)
    return transformComment(entity)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Query Entities (https://developers.fibery.com/guides/http-api/query-entities):
 * `<order-by> = [[<field-path>, "q/asc" | "q/desc"], ...]`, where a field path
 * is an array, as in `[[["fibery/id"], "q/asc"]]`. "Sorting by fibery/id
 * guarantees that Entities order won't change on different executions of the
 * same query."
 */
const ORDER_BY_ID = [[[FIELD_ID], 'q/asc']]

/** Databases: meta `fibery/domain?` defaults to false. */
function isDomainDatabase(t: FiberyTypeSchema): boolean {
  return t['fibery/meta']?.['fibery/domain?'] === true
}

/** The domain Database with this `fibery/id`: the only kind listProjects returns. */
function domainDatabase(
  types: FiberyTypeSchema[] | undefined,
  id: string,
): FiberyTypeSchema | undefined {
  return (types ?? []).find((t) => isDomainDatabase(t) && t['fibery/id'] === id)
}

/** The Field whose meta has `ui/title?` (Databases guide, the `${space}/name` Field). */
function titleFieldOf(t: FiberyTypeSchema): string | undefined {
  return (t['fibery/fields'] ?? []).find((f) => f['fibery/meta']?.['ui/title?'] === true)?.[
    'fibery/name'
  ]
}

/** Get Schema example: the assignments mixin's `assignments/assignees` collection of users. */
const ASSIGNEES_FIELD = 'assignments/assignees'

/**
 * The entity query for a task Database, selecting only documented Fields.
 * Query Entities: "`<field-name>` is used for primitive fields", an entity
 * Field needs the dereference form (`{"fibery/created-by": ["fibery/id"]}`),
 * and a collection the subselect form
 * (`{"user/assignees": {"q/select": ["fibery/id"], "q/limit": 100}}`).
 * A Database with no title Field is refused: it has no name for its Entities.
 */
function taskQuery(t: FiberyTypeSchema): {
  query: Record<string, unknown>
  fields: FiberyTaskFields
} {
  const titleField = titleFieldOf(t)
  if (titleField === undefined)
    throw Object.assign(
      new Error(
        `Fibery cannot list tasks of database ${t['fibery/name']}: it has no title Field (meta "ui/title?")`,
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  const hasAssignees = (t['fibery/fields'] ?? []).some(
    (f) =>
      f['fibery/name'] === ASSIGNEES_FIELD && f['fibery/meta']?.['fibery/collection?'] === true,
  )
  const select: (string | Record<string, unknown>)[] = [
    FIELD_ID,
    FIELD_PUBLIC_ID,
    FIELD_CREATION_DATE,
    FIELD_MODIFICATION_DATE,
    { [FIELD_CREATED_BY]: [FIELD_ID] },
    titleField,
  ]
  if (hasAssignees) select.push({ [ASSIGNEES_FIELD]: { 'q/select': [FIELD_ID], 'q/limit': 100 } })
  return {
    query: { 'q/from': t['fibery/name'], 'q/select': select },
    fields: { titleField, assigneesField: hasAssignees ? ASSIGNEES_FIELD : undefined },
  }
}

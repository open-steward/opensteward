/**
 * Fibery HTTP client.
 *
 * Fibery exposes a single command-based endpoint:
 *   POST https://{account}.fibery.io/api/commands
 *
 * The request body is an array of command objects. Authentication uses a
 * static API token: `Authorization: Token <token>`.
 *
 * Rate limits: 3 req/s per token, 7 req/s workspace-wide.
 * HTTP 429 and 5xx are retried with exponential back-off.
 *
 * Docs: https://developers.fibery.com/guides/http-api/overview
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_TEMPLATE, COMMANDS_PATH, FIELD_ID, DEFAULT_PAGE_SIZE } from './constants'

/** Shape of a single Fibery command request object. */
export interface FiberyCommand {
  command: string
  args: Record<string, unknown>
}

/** Envelope returned by /api/commands for a single command result. */
export interface FiberyResult<T = unknown> {
  success: boolean
  result: T
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class FiberyClient {
  private http: AxiosInstance
  readonly account: string

  /**
   * @param credentials  Must contain `accessToken` (API token) and
   *                     `extra.account` (workspace subdomain, e.g. "myco").
   */
  constructor(credentials: Credentials) {
    const account = (credentials.extra?.['account'] as string | undefined) ?? ''
    this.account = account
    const baseURL = API_BASE_URL_TEMPLATE.replace('{account}', account)

    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Token ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Execute a batch of Fibery commands. Returns the array of result envelopes
   * in the same order as the commands.
   */
  async commands<T = unknown>(cmds: FiberyCommand[]): Promise<FiberyResult<T>[]> {
    return withRetry(async () => {
      const { data } = await this.http.post<FiberyResult<T>[]>(COMMANDS_PATH, cmds)
      return data
    })
  }

  /**
   * Convenience: execute a single command and return its result payload.
   * Throws if `success` is false.
   */
  async command<T = unknown>(cmd: FiberyCommand): Promise<T> {
    const [res] = await this.commands<T>([cmd])
    if (!res?.success) {
      const errResult = res?.result as { message?: string; name?: string } | undefined
      throw new Error(
        `Fibery command ${cmd.command} failed: ${errResult?.message ?? errResult?.name ?? 'unknown error'}`,
      )
    }
    return res.result
  }

  /**
   * Query the workspace schema (all databases and their fields).
   */
  async querySchema(): Promise<FiberySchemaResult> {
    return this.command<FiberySchemaResult>({
      command: 'fibery.schema/query',
      args: {},
    })
  }

  /**
   * Execute a fibery.entity/query command and return all matching entities.
   * Handles cursor-based pagination automatically up to `maxPages`.
   *
   * @param from       Database name in "Space/Type" format
   * @param select     Array of field names to include
   * @param opts       Optional filters, ordering, limit per page, cursor
   */
  async queryEntities(
    from: string,
    select: (string | Record<string, unknown>)[],
    opts: {
      where?: unknown[]
      orderBy?: unknown[]
      limit?: number
      cursorId?: string
      maxPages?: number
    } = {},
  ): Promise<Record<string, unknown>[]> {
    const pageSize = opts.limit ?? DEFAULT_PAGE_SIZE
    const maxPages = opts.maxPages ?? 20
    const results: Record<string, unknown>[] = []
    let cursorId = opts.cursorId

    // Ensure fibery/id is always selected for cursor pagination
    const baseSelect: (string | Record<string, unknown>)[] = select.includes(FIELD_ID)
      ? select
      : [FIELD_ID, ...select]

    for (let page = 0; page < maxPages; page++) {
      const query: Record<string, unknown> = {
        'q/from': from,
        'q/select': baseSelect,
        'q/limit': pageSize + 1, // sentinel: +1 detects more pages
        'q/order-by': opts.orderBy ?? [[FIELD_ID, 'q/asc']],
      }

      const params: Record<string, unknown> = {}

      // Build where clause combining any caller filter + pagination cursor
      const whereConditions: unknown[] = []
      if (opts.where) whereConditions.push(opts.where)
      if (cursorId) {
        whereConditions.push(['>', [FIELD_ID], '$_lastId'])
        params['$_lastId'] = cursorId
      }

      if (whereConditions.length === 1) {
        query['q/where'] = whereConditions[0]
      } else if (whereConditions.length > 1) {
        query['q/where'] = ['q/and', ...whereConditions]
      }

      const batch: Record<string, unknown>[] = await this.command({
        command: 'fibery.entity/query',
        args: { query, params },
      })

      const hasMore = batch.length > pageSize
      const page_items = hasMore ? batch.slice(0, pageSize) : batch
      results.push(...page_items)

      if (!hasMore || page_items.length === 0) break
      cursorId = page_items[page_items.length - 1]?.[FIELD_ID] as string | undefined
    }

    return results
  }

  /**
   * One caller page of a fibery.entity/query, by the documented offset.
   *
   * Query Entities (https://developers.fibery.com/guides/http-api/query-entities):
   * `q/offset` "How many Entities to skip — useful for pagination." and
   * `q/limit` "How many Entities to return." The page is asked for at exactly
   * the caller's limit. A short page is the end. A full page is followed by the
   * same query for the one Entity after it, whose presence is `hasMore`: the
   * pagination guide's sentinel (`q/limit` of page size + 1) answers the same
   * question, but by asking for more rows than the caller wants, which the
   * paging gate fails as over-asking. Callers order by `fibery/id` so an
   * offset means the same rows twice.
   */
  async queryPage(
    query: Record<string, unknown>,
    params: Record<string, unknown>,
    page: { limit: number; offset: number },
  ): Promise<{ rows: Record<string, unknown>[]; hasMore: boolean }> {
    const rows = await this.command<Record<string, unknown>[]>({
      command: 'fibery.entity/query',
      args: { query: { ...query, 'q/offset': page.offset, 'q/limit': page.limit }, params },
    })
    if (rows.length < page.limit) return { rows, hasMore: false }
    const next = await this.command<Record<string, unknown>[]>({
      command: 'fibery.entity/query',
      args: {
        query: {
          ...query,
          'q/select': [FIELD_ID],
          'q/offset': page.offset + page.limit,
          'q/limit': 1,
        },
        params,
      },
    })
    return { rows, hasMore: next.length > 0 }
  }
}

/**
 * Minimal shape of the fibery.schema/query response.
 * Get Schema: https://developers.fibery.com/guides/http-api/schema
 */
export interface FiberySchemaResult {
  'fibery/id': string
  'fibery/types': FiberyTypeSchema[]
  'fibery/meta'?: Record<string, unknown>
}

export interface FiberyTypeSchema {
  'fibery/id': string
  /** `${space}/${name}` format. */
  'fibery/name': string
  'fibery/fields': FiberyFieldSchema[]
  /** Includes `fibery/domain?` ("Domain Databases are available as cards on Views") and `ui/color`. */
  'fibery/meta'?: Record<string, unknown>
}

export interface FiberyFieldSchema {
  'fibery/id': string
  'fibery/name': string
  /** A primitive Field type such as `fibery/text`, or the related Database's name. */
  'fibery/type'?: string
  /** Includes `ui/title?` and `fibery/collection?`. */
  'fibery/meta'?: Record<string, unknown>
}

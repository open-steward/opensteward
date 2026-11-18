/**
 * Tool registry — turns the canonical resource catalogue into a flat
 * list of MCP tools.
 *
 * Read-only by structure: this module never emits a tool whose name
 * matches `^(create|update|delete|patch)_`. The registry doesn't read
 * the adapter interface; it walks the catalogue and emits `list_*` and
 * `get_*` only. Adding a write method on an adapter cannot leak a
 * write tool here.
 *
 * Tenant mode emits 3 customer-level tools + 151 resource tools (76
 * catalogue entries, of which one is a singleton emitting `get_` only) = 154.
 * End-user mode emits 2 customer-level tools instead, for 153. With
 * `BuildOptions.verticals`, only those verticals' resource tools.
 */
import { z } from 'zod'
import { type ResourceDef, RESOURCES } from './resources.js'
import { STATUS_ENUMS } from './generated/status-enums.js'
import type { RestClient } from './rest-client.js'
import { wrapPayload, type SanitizeOptions } from './sanitize.js'

export type ToolMode = 'tenant' | 'end-user'

/**
 * MCP tool definition, in the shape `McpServer.registerTool` accepts.
 *
 * `schema` is a Zod object rather than hand-rolled JSON Schema: v2 of the
 * SDK requires a StandardSchema (it reads `~standard.jsonSchema` to advertise
 * the tool in `tools/list`) and will not take a plain JSON Schema object.
 *
 * Every tool uses `z.strictObject`, which emits `additionalProperties: false`.
 *
 * `list_*` tools were once `z.looseObject`, on the belief that unrecognised
 * keys were forwarded to the REST API as filters. They were forwarded, but the
 * server reads a fixed allowlist (`page`, `limit`, `updated_after`, `search`)
 * and drops everything else — so no passed-through key ever filtered anything.
 * The only effect was that a misspelled parameter parsed cleanly and read to
 * the agent as a filter that worked.
 */
export interface McpTool {
  name: string
  description: string
  schema: z.ZodType<Record<string, unknown>>
  /** Implementation called when the agent invokes the tool. */
  call: (args: Record<string, unknown>) => Promise<string>
}

/**
 * Resources that share a name across verticals get a `<vertical>_`
 * prefix on the tool name to keep the agent's tool list unambiguous.
 * Unique names get a clean form: `list_invoices` over
 * `accounting_list_invoices`.
 */
function computeNameConflicts(resources: ReadonlyArray<ResourceDef>): Set<string> {
  const counts = new Map<string, number>()
  for (const r of resources) counts.set(r.toolBase, (counts.get(r.toolBase) ?? 0) + 1)
  const conflicts = new Set<string>()
  for (const [base, count] of counts) if (count > 1) conflicts.add(base)
  // `customers` is already a genuine collision (ecommerce and payments both
  // export it), so this add is a no-op today. It stays as a guard: even if
  // one of them were dropped, the survivor must keep its vertical prefix so
  // it is never confused with the tenant-level `list_customers` tool.
  conflicts.add('customers')
  return conflicts
}

function toolName(verb: 'list' | 'get', resource: ResourceDef, conflicts: Set<string>): string {
  const base = conflicts.has(resource.toolBase)
    ? `${resource.vertical}_${resource.toolBase}`
    : resource.toolBase
  return `${verb}_${base}`
}

/**
 * Shared pagination/filter fields. The descriptions are the advertised tool
 * contract — what the agent actually reads — so this list must name exactly
 * the query parameters the REST API implements, and no others.
 *
 * It previously promised `offset`, `since` and `status` on all ~150 list
 * tools. The server's `parseQueryParams` reads four keys — `page`, `limit`,
 * `updated_after`, `search` — and the OpenAPI document describes the same
 * four, so those three were accepted, forwarded and dropped in silence:
 * `list_invoices(status="PAID")` answered with AUTHORIZED invoices, on both
 * Fortnox and Xero, which is what located the fault upstream of the adapters.
 *
 * A silently-ignored filter is worse than a rejected one — the agent gets a
 * plausible answer to a question it did not ask, with nothing to notice.
 *
 *   - `offset` is gone: the API pages by `page`, and an offset that is not a
 *     multiple of `limit` cannot be expressed as one. Advertising it as
 *     "mutually exclusive with page" implied a choice that never existed.
 *   - `status` is gone: no endpoint filters on it. It needs per-adapter
 *     upstream support before it can be advertised again, since a canonical
 *     status filter applied after paging would silently return short pages.
 *   - `since` survives only as an alias mapped onto `updated_after` in the
 *     call below, because agents already use the name.
 *   - `search` is NEW here and was implemented server-side the whole time.
 *     The surface was wrong in both directions.
 */
const PAGINATION_FIELDS = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(
      'Page size, max 100. Omitted, the server uses 100, or less where the platform serves ' +
        'smaller pages; the response\'s meta.limit is the page size actually served. ' +
        'Paginate rather than asking for huge limits.',
    ),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Page number (1-based). Keep paging while meta.hasMore is true or null (null means ' +
        'the page was full and the server cannot tell); stop when it is false. A page can be ' +
        'shorter than meta.limit and still have more, so do not stop on the row count. Stop ' +
        'too if a page repeats ids you already have: some platforms ignore the page number.',
    ),
  updated_after: z
    .string()
    .optional()
    .describe('ISO-8601 timestamp; only return records updated at or after this point.'),
  since: z
    .string()
    .optional()
    .describe('Deprecated alias for `updated_after`. Prefer `updated_after`.'),
  search: z
    .string()
    .optional()
    .describe(
      'Free-text search. Supported by 54 of the 1,545 adapters; a connection whose ' +
        'platform does not support it answers 400 SEARCH_UNSUPPORTED rather than ' +
        'silently returning unfiltered results.',
    ),
} as const

const CONNECTION_ID_FIELD = z
  .string()
  .describe(
    'The connection id from `list_customer_connections`. Picks which adapter ' +
      '(e.g. xero, fortnox) the call lands on.',
  )

export interface BuildOptions {
  mode: ToolMode
  client: RestClient
  sanitize?: SanitizeOptions
  /**
   * Verticals the deployment reports for this token (GET /v1/capabilities or
   * /v1/me/capabilities). `undefined` = unknown (an older server, or the read
   * failed): every tool. `[]` = none: customer-level tools only. Names the
   * catalogue does not know are ignored. Cosmetic — the deployment refuses
   * calls to a vertical it does not serve regardless (a 403 license refusal,
   * or a 404 in end-user mode for a vertical /v1/me does not mount).
   */
  verticals?: readonly string[]
}

/**
 * Append the entity's `status` vocabulary to its description.
 *
 * An MCP tool advertises only its INPUT schema, so nothing an agent can see
 * says what a RESPONSE field may contain. Four review rounds concluded the
 * normalized status enum was undefined because of exactly this: every entity
 * has declared a per-entity enum all along, published in the OpenAPI document,
 * and none of it was reachable from here.
 *
 * Only entities that actually have one are annotated. Contacts, for instance,
 * model activity as an `isActive` boolean rather than a status, and inventing
 * a vocabulary for them would be worse than saying nothing.
 */
function withStatusVocabulary(description: string, r: ResourceDef): string {
  const values = STATUS_ENUMS[`${r.vertical}:${r.path}`]
  if (!values || values.length === 0) return description
  return (
    `${description} Possible \`status\` values: ${values.join(', ')}. ` +
    '`unknown` means the platform reported a state this API could not map.'
  )
}

export function buildTools(opts: BuildOptions): McpTool[] {
  // The FULL catalogue on purpose: a license must never rename a tool.
  const conflicts = computeNameConflicts(RESOURCES)
  const allowed = opts.verticals === undefined ? null : new Set<string>(opts.verticals)
  const tools: McpTool[] = []
  const wrap = (data: unknown) => wrapPayload(data, opts.sanitize)

  // ── customer-level tools ────────────────────────────────────────────────
  if (opts.mode === 'tenant') {
    tools.push({
      name: 'list_customers',
      description:
        'List end-customers belonging to your tenant. Use this to discover ' +
        'who is connected before asking for resource data.',
      // `offset` is declared locally, not taken from PAGINATION_FIELDS, because
      // it is real HERE and nowhere else: `/v1/customers` is a control-plane
      // endpoint that genuinely reads `q`/`limit`/`offset`, while the vertical
      // resource lists read `page`. Sharing one field set across two endpoints
      // with different query contracts is what let a parameter be advertised
      // on 150 tools that could not honour it.
      schema: z.strictObject({
        q: z.string().optional().describe('Free-text search across email and display name.'),
        limit: PAGINATION_FIELDS.limit,
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Result offset. Supported on this endpoint only.'),
      }),
      call: async (args) =>
        wrap(await opts.client.listCustomers(args as { q?: string; limit?: number; offset?: number })),
    })
    tools.push({
      name: 'get_customer',
      description: 'Fetch a single customer record by id. Does not include encrypted PII by default.',
      schema: z.strictObject({
        customer_id: z.string().describe('The customer id from `list_customers`.'),
      }),
      call: async (args) => wrap(await opts.client.getCustomer(String(args['customer_id']))),
    })
    tools.push({
      name: 'list_customer_connections',
      description:
        'List the integrations a single customer has connected (e.g. Xero, Shopify). ' +
        'Each row carries a `connection_id` you pass to the resource tools below.',
      schema: z.strictObject({ customer_id: z.string() }),
      call: async (args) => wrap(await opts.client.listCustomerConnections(String(args['customer_id']))),
    })
  } else {
    tools.push({
      name: 'get_me',
      description:
        'Fetch your own customer record (the holder of this MCP token). ' +
        'Returns no PII by default — pass `include_pii=true` only if the token ' +
        'carries the mcp:read_pii scope.',
      schema: z.strictObject({
        include_pii: z
          .boolean()
          .optional()
          .describe(
            'Reveal sensitive personal-ID fields. Requires the `mcp:read_pii` ' +
              'scope on the token; the request is refused with 403 otherwise, ' +
              'and every reveal is audit-logged.',
          ),
      }),
      call: async (args) =>
        wrap(await opts.client.getMe({ include_pii: args['include_pii'] === true })),
    })
    tools.push({
      name: 'list_my_connections',
      description:
        'List the integrations you have connected. Each row carries a `connection_id` ' +
        'you pass to the resource tools below.',
      schema: z.strictObject({}),
      call: async () => wrap(await opts.client.listMyConnections()),
    })
  }

  // ── resource tools ─────────────────────────────────────────────────────
  for (const r of RESOURCES) {
    if (allowed && !allowed.has(r.vertical)) continue
    const listName = toolName('list', r, conflicts)
    const getName = toolName('get', r, conflicts)

    if (!r.singleton) {
      tools.push({
        name: listName,
        description: withStatusVocabulary(r.description + ' Returns a paginated list.', r),
        // strictObject, NOT looseObject. The loose form was chosen so that
        // unrecognised keys would reach the REST API as filters — but the
        // server reads a fixed four-key allowlist and discards everything
        // else, so nothing was ever forwarded. All it bought was that a typo
        // (`limitt`, `statuss`) parsed cleanly and read as a working filter.
        // Refusing the call is recoverable; an unfiltered answer is not.
        schema: z.strictObject({
          connection_id: CONNECTION_ID_FIELD,
          ...PAGINATION_FIELDS,
        }),
        call: async (args) => {
          const { connection_id, since, ...rest } = args as {
            connection_id: string
            since?: string
          } & Record<string, unknown>
          const params: Record<string, string | number | undefined> & { connection_id: string } = {
            connection_id,
            ...(rest as Record<string, string | number | undefined>),
          }
          // `since` is the deprecated spelling. Translated rather than passed
          // through, because the server ignores the key it was sent under —
          // forwarding both would leave a dead parameter on the query string.
          if (since !== undefined && params['updated_after'] === undefined) {
            params['updated_after'] = since
          }
          return wrap(await opts.client.listResource(r.vertical, r.path, params))
        },
      })
    }

    tools.push({
      name: getName,
      description: withStatusVocabulary(r.description + ' Fetches a single record by id.', r),
      schema: r.singleton
        ? z.strictObject({ connection_id: z.string() })
        : z.strictObject({
            connection_id: z.string(),
            id: z.string().describe('Record id from the corresponding list call.'),
          }),
      call: async (args) => {
        const connectionId = String(args['connection_id'])
        if (r.singleton) {
          // Singleton resources (e.g. organization) — list with limit=1
          // and unwrap the first element. integration-server doesn't
          // expose a `/organizations` GET-by-id; the canonical pattern
          // is the list endpoint returning a 1-element array.
          return wrap(await opts.client.listResource(r.vertical, r.path, {
            connection_id: connectionId,
            limit: 1,
          }))
        }
        return wrap(await opts.client.getResource(r.vertical, r.path, String(args['id']), connectionId))
      },
    })
  }

  // ── read-only invariant ─────────────────────────────────────────────────
  // Belt-and-braces sanity check. The registry only emits list/get above,
  // but if a future maintainer slips a write tool through, this assertion
  // fires before the server starts.
  for (const t of tools) {
    if (/^(create|update|delete|patch|put|post)_/.test(t.name)) {
      throw new Error(
        `Read-only invariant violated: tool '${t.name}' looks like a write tool. ` +
        'This MCP server only exposes list_* and get_* tools.',
      )
    }
  }

  return tools
}

/**
 * The reported verticals that actually get resource tools: the ones the
 * catalogue knows, each once. buildTools ignores the rest (a vertical newer
 * than this release, a duplicate), so this is what the ready line counts.
 */
export function registeredVerticals(verticals: readonly string[]): string[] {
  const known = new Set<string>(RESOURCES.map((r) => r.vertical))
  return [...new Set(verticals)].filter((v) => known.has(v))
}

/** Exported for unit tests. */
export const _internal = { computeNameConflicts, toolName }

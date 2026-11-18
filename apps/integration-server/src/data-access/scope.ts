/**
 * The caller scope every `/admin/data/*` route (and the metric catalog) reads.
 *
 * admin-api computes it from the signed-in operator's access and sends it as
 * the `X-OpenSteward-Data-Scope` header (JSON) or a `scope` query parameter:
 *
 *   {
 *     tenants: '*' | string[]                              — owner tenants visible
 *     tenantVerticals?: Record<tenant, '*' | string[]>     — verticals granted
 *                                                            within each tenant;
 *                                                            a tenant not listed
 *                                                            keeps every vertical
 *     verticals?: Record<vertical, '*' | string[]>         — verticals (and their
 *                                                            resource types)
 *                                                            visible; omitted = all
 *     revealPii?: boolean                                  — holds data:read_pii
 *     maskFinancial?: boolean                              — data_access.mask_financial
 *   }
 *
 * Split out of `router.ts` so the metric routes share one parser and one
 * notion of "in scope" with the record viewer.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { ConnectionRow, CredentialStore } from '@opensteward/shared'

export const DATA_SCOPE_HEADER = 'x-opensteward-data-scope'

const VerticalList = z.union([z.literal('*'), z.array(z.string())])

export const ScopeSchema = z.object({
  tenants: z.union([z.literal('*'), z.array(z.string().min(1))]),
  tenantVerticals: z.record(z.string(), VerticalList).optional(),
  verticals: z.record(z.string(), VerticalList).optional(),
  revealPii: z.boolean().optional(),
  maskFinancial: z.boolean().optional(),
})
export type DataScope = z.infer<typeof ScopeSchema>

export type ErrorCode =
  | 'INVALID_SCOPE'
  | 'CONNECTION_NOT_FOUND'
  | 'RESOURCE_TYPE_NOT_FOUND'
  | 'RESOURCE_NOT_FOUND'
  | 'DATA_STORE_DISABLED'
  | 'FIELD_NOT_SEARCHABLE'
  | 'INVALID_QUERY'
  | 'INVALID_PATH'
  | 'INVALID_CURSOR'
  | 'INVALID_FILTER'
  | 'METRIC_NOT_FOUND'
  | 'INVALID_RANGE'

export function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.status(status).send({ error: { code, message } })
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export function parseScope(request: FastifyRequest): DataScope {
  const header = request.headers[DATA_SCOPE_HEADER]
  const query = (request.query as Record<string, unknown> | undefined)?.['scope']
  const raw = typeof header === 'string' ? header : typeof query === 'string' ? query : undefined
  if (raw === undefined) {
    throw new HttpError(400, 'INVALID_SCOPE', `A data scope is required (${DATA_SCOPE_HEADER}).`)
  }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'INVALID_SCOPE', 'The data scope is not valid JSON.')
  }
  const parsed = ScopeSchema.safeParse(json)
  if (!parsed.success) throw new HttpError(400, 'INVALID_SCOPE', 'The data scope is malformed.')
  return parsed.data
}

export function verticalInScope(scope: DataScope, vertical: string): boolean {
  return !scope.verticals || Object.hasOwn(scope.verticals, vertical)
}

export function typeInScope(scope: DataScope, vertical: string, resourceType: string): boolean {
  if (!scope.verticals) return true
  const allowed = scope.verticals[vertical]
  if (allowed === undefined) return false
  return allowed === '*' || allowed.includes(resourceType)
}

export function connectionInScope(scope: DataScope, row: ConnectionRow): boolean {
  if (!row.vertical || !verticalInScope(scope, row.vertical)) return false
  if (scope.tenants === '*') return true
  if (row.ownerTenantId === null || !scope.tenants.includes(row.ownerTenantId)) return false
  const granted = scope.tenantVerticals?.[row.ownerTenantId]
  return granted === undefined || granted === '*' || granted.includes(row.vertical)
}

/** Every connection the scope may see (owner tenant and vertical re-checked). */
export async function connectionsInScope(
  credentialStore: CredentialStore,
  scope: DataScope,
): Promise<ConnectionRow[]> {
  let rows: ConnectionRow[]
  if (scope.tenants === '*') {
    rows = await credentialStore.list()
  } else {
    const byId = new Map<string, ConnectionRow>()
    for (const t of scope.tenants) {
      for (const r of await credentialStore.listForOwner(t)) byId.set(r.id, r)
    }
    rows = [...byId.values()]
  }
  return rows.filter((r) => connectionInScope(scope, r))
}

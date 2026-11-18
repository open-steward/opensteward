/**
 * Shapes of admin-api's destinations (`/api/destinations/*`) and read-only
 * SQL access (`/api/sql-access/*`) answers, as the admin UI reads them.
 * Timestamps on destinations and runs arrive as ISO strings; secrets and SQL
 * passwords never appear here except in {@link SqlPrincipalSecretRecord},
 * which exists for exactly one render.
 */

export interface DestinationScopeRecord {
  tenants: '*' | string[]
  verticals?: Record<string, '*' | string[]>
  maskFinancial?: boolean
}

/** A JSON Schema object as the type catalog sends it (only what the form reads). */
export interface JsonSchemaObject {
  type?: string | string[]
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  description?: string
}

export interface JsonSchemaProperty {
  type?: string | string[]
  enum?: unknown[]
  default?: unknown
  description?: string
  format?: string
  minimum?: number
  maximum?: number
  anyOf?: JsonSchemaProperty[]
  /** A nested object's own properties (e.g. a loader's `stage`). */
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
}

export interface DestinationTypeRecord {
  type: string
  label: string
  kind: string
  available: boolean
  experimental?: boolean
  configSchema: JsonSchemaObject | null
  secretsSchema: JsonSchemaObject | null
  secretFields: string[]
}

export interface DestinationRecord {
  id: string
  name: string
  type: string
  config: Record<string, unknown>
  secretFieldsSet: string[]
  includePii: boolean
  piiApprovedBy: string | null
  scope: DestinationScopeRecord
  intervalSec: number
  enabled: boolean
  createdBy: string | null
  createdAt: string | null
  updatedAt: string | null
  lastRunAt: string | null
  lastStatus: string | null
  lastError: string | null
}

export interface DestinationInput {
  name: string
  type: string
  config: Record<string, unknown>
  /** Write-only; nested objects follow the type's secrets schema. */
  secrets?: Record<string, unknown>
  scope: DestinationScopeRecord
  includePii?: boolean
  intervalSec?: number
  enabled?: boolean
}

export interface DestinationRunFileRecord {
  path: string
  kind: string
  vertical?: string
  resourceType?: string
  rows: number
}

export interface DestinationRunRecord {
  id: string
  destinationId: string
  trigger: string
  status: string
  startedAt: string | null
  finishedAt: string | null
  rowsWritten: number
  deletesWritten: number
  files: DestinationRunFileRecord[]
  error: string | null
}

export interface DestinationTestRecord {
  ok: boolean
  error?: string
  latencyMs: number
}

export interface DestinationBackfillInput {
  vertical?: string
  resourceType?: string
  run?: boolean
}

export interface DestinationBackfillRecord {
  cursorsReset: number
  runId: string | null
}

export interface SqlAccessStatusRecord {
  backend: 'postgres' | 'sqlite'
  mode: 'managed' | 'manual'
  provisioned: boolean
  version: number | null
  hash: string | null
  catalogHash: string
  upToDate: boolean
  readHost: string | null
  database: string | null
  schemas: { masked: string; pii: string }
  pgcrypto: boolean | null
  warnings: string[]
}

export interface SqlProvisionRecord {
  changed: boolean
  version: number
  hash: string
  breaking: boolean
  changes: string[]
  warnings: string[]
}

export interface SqlCatalogColumnRecord {
  name: string
  source: string
  field?: string
  type: string
  maskedType: string
  class: string
  mask?: string
}

export interface SqlCatalogViewRecord {
  name: string
  kind: string
  vertical?: string
  resourceType?: string
  columns: SqlCatalogColumnRecord[]
}

export interface SqlCatalogRecord {
  format: number
  hash: string
  schemas: { masked: string; pii: string }
  views: SqlCatalogViewRecord[]
}

export interface SqlPrincipalRecord {
  id: string
  username: string
  label: string
  pii: boolean
  scope: { tenants: '*' | string[]; verticals?: '*' | string[] }
  connectionLimit: number
  createdBy: string | null
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
  lastRotatedAt: string | null
  status: string
  searchPath: string
}

export interface SqlPrincipalInput {
  label: string
  pii?: boolean
  scope: { tenants: '*' | string[]; verticals?: '*' | string[] }
  expiresAt?: string | null
  connectionLimit?: number
}

/** Create / rotate answer. `password` is shown once and never stored. */
export interface SqlPrincipalSecretRecord {
  principal: SqlPrincipalRecord
  password: string
  connection: { host: string | null; username: string; searchPath: string }
  mode: 'managed' | 'manual'
  sessionsTerminated?: number | null
  script?: string
}

export interface SqlRevokeRecord {
  principal: SqlPrincipalRecord
  mode: 'managed' | 'manual'
  sessionsTerminated: number | null
  script?: string
}

/**
 * Destinations — shared types and per-type configuration schemas.
 *
 * A destination is somewhere the stored copy of synced records is exported
 * to on a schedule: Parquet files in an object store (S3 and compatibles,
 * GCS, Azure Blob) or rows in a Postgres database the operator owns.
 *
 * Every type splits its configuration in two:
 *
 *   config   — plain, non-secret settings (bucket, region, host, …). Stored
 *              as JSON and returned by the API.
 *   secrets  — credentials (access keys, passwords, service-account JSON).
 *              Encrypted at rest, WRITE-ONLY over the API: responses carry
 *              only the names of the fields that are set.
 *
 * Warehouse loaders (Snowflake, BigQuery, Databricks) stage Parquet files in
 * an object store and MERGE them into a current-state table; `iceberg`
 * (experimental) writes Iceberg-ready files and manages the tables in an
 * Iceberg REST catalog. Their schemas live in ./loaders/schemas.ts.
 */
import { z } from 'zod'
import {
  BigQueryConfigSchema,
  BigQuerySecretsSchema,
  DatabricksConfigSchema,
  DatabricksSecretsSchema,
  IcebergConfigSchema,
  IcebergSecretsSchema,
  SnowflakeConfigSchema,
  SnowflakeSecretsSchema,
} from './loaders/schemas'

export const OBJECT_STORE_TYPES = ['s3', 'gcs', 'azure_blob'] as const
export const TABLE_TYPES = ['postgres'] as const
/** Warehouse loaders: staged Parquet + a warehouse-side MERGE. */
export const LOADER_TYPES = ['snowflake', 'bigquery', 'databricks'] as const
/** Experimental types: listed with `experimental: true` in the catalog. */
export const EXPERIMENTAL_TYPES = ['iceberg'] as const

export const IMPLEMENTED_TYPES = [
  ...OBJECT_STORE_TYPES,
  ...TABLE_TYPES,
  ...LOADER_TYPES,
  ...EXPERIMENTAL_TYPES,
] as const

export type ObjectStoreType = (typeof OBJECT_STORE_TYPES)[number]
export type ImplementedDestinationType = (typeof IMPLEMENTED_TYPES)[number]
export type LoaderType = (typeof LOADER_TYPES)[number]
export type ExperimentalType = (typeof EXPERIMENTAL_TYPES)[number]
export type DestinationType = ImplementedDestinationType

export function isImplementedType(type: string): type is ImplementedDestinationType {
  return (IMPLEMENTED_TYPES as readonly string[]).includes(type)
}

export function isObjectStoreType(type: string): type is ObjectStoreType {
  return (OBJECT_STORE_TYPES as readonly string[]).includes(type)
}

// ── Config schemas ───────────────────────────────────────────────────────

/**
 * An object-key prefix: relative, `/`-separated, no `..` segments. Stored
 * normalised without a leading slash and with a trailing one (or empty).
 */
const PrefixSchema = z
  .string()
  .max(512)
  .regex(/^[A-Za-z0-9._\-=/]*$/, 'Prefix may contain letters, digits, . _ - = and /')
  .refine((p) => !p.split('/').includes('..'), 'Prefix may not contain `..` segments')
  .default('')
  .describe('Key prefix inside the bucket/container, e.g. `opensteward/prod/`. Optional.')

const CompressionSchema = z
  .enum(['zstd', 'snappy', 'none'])
  .default('zstd')
  .describe('Parquet column compression. `zstd` (default) is smaller; `snappy` is faster to read.')

const HttpUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL')

export const S3ConfigSchema = z
  .object({
    bucket: z.string().min(3).max(255).describe('Bucket name.'),
    region: z
      .string()
      .min(1)
      .max(64)
      .default('us-east-1')
      .describe('Bucket region. Any value works for most S3-compatible stores.'),
    prefix: PrefixSchema,
    endpoint: HttpUrlSchema.optional().describe(
      'Custom endpoint for S3-compatible stores (MinIO, Cloudflare R2, Backblaze B2, …). Omit for AWS.',
    ),
    forcePathStyle: z
      .boolean()
      .default(false)
      .describe('Use path-style URLs (`endpoint/bucket/key`). Needed for MinIO.'),
    compression: CompressionSchema,
  })
  .strict()

export const S3SecretsSchema = z
  .object({
    accessKeyId: z.string().min(1).max(256).optional().describe('Access key id.'),
    secretAccessKey: z.string().min(1).max(512).optional().describe('Secret access key.'),
    sessionToken: z
      .string()
      .min(1)
      .max(4096)
      .optional()
      .describe('Session token (temporary credentials).'),
  })
  .strict()
  .refine(
    (s) => (s.accessKeyId === undefined) === (s.secretAccessKey === undefined),
    'accessKeyId and secretAccessKey must be set together (omit both to use the default AWS credential chain)',
  )

export const GcsConfigSchema = z
  .object({
    bucket: z.string().min(3).max(222).describe('Bucket name.'),
    prefix: PrefixSchema,
    projectId: z.string().min(1).max(128).optional().describe('GCP project id. Optional.'),
    apiEndpoint: HttpUrlSchema.optional().describe(
      'Custom API endpoint (e.g. a fake-gcs-server for testing). Omit for Google Cloud.',
    ),
    compression: CompressionSchema,
  })
  .strict()

export const GcsSecretsSchema = z
  .object({
    credentialsJson: z
      .string()
      .min(2)
      .max(20_000)
      .refine((s) => {
        try {
          const v = JSON.parse(s) as unknown
          return typeof v === 'object' && v !== null && !Array.isArray(v)
        } catch {
          return false
        }
      }, 'Must be a service-account key JSON object')
      .optional()
      .describe('Service-account key JSON. Omit to use Application Default Credentials.'),
  })
  .strict()

export const AzureBlobConfigSchema = z
  .object({
    accountName: z
      .string()
      .regex(/^[a-z0-9]{3,24}$/, 'Storage account names are 3-24 lowercase letters or digits')
      .describe('Storage account name.'),
    container: z.string().min(3).max(63).describe('Blob container name.'),
    prefix: PrefixSchema,
    endpoint: HttpUrlSchema.optional().describe(
      'Custom blob endpoint (e.g. Azurite). Defaults to `https://<account>.blob.core.windows.net`.',
    ),
    compression: CompressionSchema,
  })
  .strict()

export const AzureBlobSecretsSchema = z
  .object({
    accountKey: z.string().min(1).max(512).optional().describe('Storage account key.'),
    sasToken: z
      .string()
      .min(1)
      .max(4096)
      .optional()
      .describe('Container SAS token with write + create permission (without the leading `?`).'),
  })
  .strict()

export const PostgresConfigSchema = z
  .object({
    host: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[A-Za-z0-9.\-:[\]]+$/, 'Must be a hostname or IP address')
      .describe('Database host.'),
    port: z.number().int().min(1).max(65535).default(5432).describe('Database port.'),
    database: z.string().min(1).max(63).describe('Database name.'),
    user: z.string().min(1).max(63).describe('User to connect as. Needs CREATE on the schema.'),
    schema: z
      .string()
      .regex(
        /^[a-z_][a-z0-9_]{0,62}$/,
        'Lowercase letters, digits and _, starting with a letter or _',
      )
      .default('opensteward')
      .describe('Schema the export tables are created in. Created if missing.'),
    ssl: z
      .enum(['disable', 'require', 'verify-full'])
      .default('require')
      .describe(
        'TLS mode. `require` encrypts without verifying the certificate; `verify-full` also verifies it.',
      ),
  })
  .strict()

export const PostgresSecretsSchema = z
  .object({
    password: z.string().min(1).max(1024).optional().describe('Password for `user`.'),
  })
  .strict()

export type S3Config = z.infer<typeof S3ConfigSchema>
export type S3Secrets = z.infer<typeof S3SecretsSchema>
export type GcsConfig = z.infer<typeof GcsConfigSchema>
export type GcsSecrets = z.infer<typeof GcsSecretsSchema>
export type AzureBlobConfig = z.infer<typeof AzureBlobConfigSchema>
export type AzureBlobSecrets = z.infer<typeof AzureBlobSecretsSchema>
export type PostgresConfig = z.infer<typeof PostgresConfigSchema>
export type PostgresSecrets = z.infer<typeof PostgresSecretsSchema>

export interface TypeSchemas {
  label: string
  kind: 'object_store' | 'table' | 'loader'
  /** Works, but its behaviour and format may still change. */
  experimental?: boolean
  config: z.ZodType<Record<string, unknown>>
  secrets: z.ZodType<Record<string, unknown>>
}

export const TYPE_SCHEMAS: Readonly<Record<ImplementedDestinationType, TypeSchemas>> = {
  s3: {
    label: 'Amazon S3 (and S3-compatible)',
    kind: 'object_store',
    config: S3ConfigSchema,
    secrets: S3SecretsSchema,
  },
  gcs: {
    label: 'Google Cloud Storage',
    kind: 'object_store',
    config: GcsConfigSchema,
    secrets: GcsSecretsSchema,
  },
  azure_blob: {
    label: 'Azure Blob Storage',
    kind: 'object_store',
    config: AzureBlobConfigSchema,
    secrets: AzureBlobSecretsSchema,
  },
  postgres: {
    label: 'PostgreSQL',
    kind: 'table',
    config: PostgresConfigSchema,
    secrets: PostgresSecretsSchema,
  },
  snowflake: {
    label: 'Snowflake',
    kind: 'loader',
    config: SnowflakeConfigSchema,
    secrets: SnowflakeSecretsSchema,
  },
  bigquery: {
    label: 'Google BigQuery',
    kind: 'loader',
    config: BigQueryConfigSchema,
    secrets: BigQuerySecretsSchema,
  },
  databricks: {
    label: 'Databricks (Delta)',
    kind: 'loader',
    config: DatabricksConfigSchema,
    secrets: DatabricksSecretsSchema,
  },
  iceberg: {
    label: 'Apache Iceberg (REST catalog, experimental)',
    kind: 'loader',
    experimental: true,
    config: IcebergConfigSchema,
    secrets: IcebergSecretsSchema,
  },
}

/** Thrown for invalid configuration; `issues` is safe to return to a caller. */
export class DestinationConfigError extends Error {
  constructor(
    message: string,
    readonly issues: Array<{ path: string; message: string }> = [],
  ) {
    super(message)
    this.name = 'DestinationConfigError'
  }
}

function issuesOf(err: z.ZodError): Array<{ path: string; message: string }> {
  return err.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }))
}

/** Normalise an object-key prefix: no leading slash, trailing slash when non-empty. */
export function normalizePrefix(prefix: string | undefined): string {
  const p = (prefix ?? '').replace(/^\/+/, '').replace(/\/{2,}/g, '/')
  return p === '' || p.endsWith('/') ? p : `${p}/`
}

/** Validate a type's non-secret config. Throws `DestinationConfigError`. */
export function parseConfig(type: string, config: unknown): Record<string, unknown> {
  if (!isImplementedType(type)) {
    throw new DestinationConfigError(`Destination type '${type}' is not supported.`)
  }
  const parsed = TYPE_SCHEMAS[type].config.safeParse(config ?? {})
  if (!parsed.success) {
    throw new DestinationConfigError('Invalid destination config.', issuesOf(parsed.error))
  }
  const out = parsed.data
  if (typeof out['prefix'] === 'string') out['prefix'] = normalizePrefix(out['prefix'])
  return out
}

/**
 * Validate a type's secrets. Empty-string values are dropped first, so a form
 * that submits every field blank means "no value" rather than "empty key".
 */
export function parseSecrets(type: string, secrets: unknown): Record<string, string> {
  if (!isImplementedType(type)) {
    throw new DestinationConfigError(`Destination type '${type}' is not supported.`)
  }
  const cleaned: Record<string, unknown> = {}
  if (secrets && typeof secrets === 'object' && !Array.isArray(secrets)) {
    for (const [k, v] of Object.entries(secrets)) if (v !== '' && v !== null) cleaned[k] = v
  }
  const parsed = TYPE_SCHEMAS[type].secrets.safeParse(cleaned)
  if (!parsed.success) {
    throw new DestinationConfigError('Invalid destination credentials.', issuesOf(parsed.error))
  }
  return parsed.data as Record<string, string>
}

/**
 * Cross-field requirements that need config and secrets together (the
 * schemas above validate each half on its own).
 */
export function assertComplete(
  type: string,
  secrets: Record<string, string>,
  config: Record<string, unknown> = {},
): void {
  if (type === 'azure_blob' && !secrets['accountKey'] && !secrets['sasToken']) {
    throw new DestinationConfigError('Azure Blob needs an accountKey or a sasToken.', [
      { path: 'secrets', message: 'Set accountKey or sasToken' },
    ])
  }
  const stage = (config['stage'] ?? config['storage']) as
    { type?: string; storageIntegration?: string } | undefined
  if (stage?.type === 'azure' && !secrets['stageAccountKey'] && !secrets['stageSasToken']) {
    throw new DestinationConfigError('An Azure stage needs stageAccountKey or stageSasToken.', [
      { path: 'secrets', message: 'Set stageAccountKey or stageSasToken' },
    ])
  }
  if (type === 'snowflake' && stage && !stage.storageIntegration) {
    const inline =
      stage.type === 's3'
        ? Boolean(secrets['stageAccessKeyId'] && secrets['stageSecretAccessKey'])
        : stage.type === 'azure'
          ? Boolean(secrets['stageSasToken'])
          : false
    if (!inline) {
      throw new DestinationConfigError(
        stage.type === 'gcs'
          ? 'A Snowflake GCS stage needs stage.storageIntegration.'
          : 'Set stage.storageIntegration, or the stage credentials Snowflake should read the stage with.',
        [
          {
            path: 'stage.storageIntegration',
            message: 'Required without inline stage credentials',
          },
        ],
      )
    }
  }
}

// ── Scope ────────────────────────────────────────────────────────────────

/**
 * Which records a destination exports: owner tenants, and verticals (with
 * their resource types). Same shape as the data-access scope, minus
 * `revealPii` — a destination's PII flag is its own `include_pii` column,
 * approved by a user who holds `data:read_pii`.
 */
export const DestinationScopeSchema = z
  .object({
    tenants: z.union([z.literal('*'), z.array(z.string().min(1)).max(1000)]),
    verticals: z
      .record(z.string(), z.union([z.literal('*'), z.array(z.string().min(1)).max(500)]))
      .optional(),
    maskFinancial: z.boolean().optional(),
  })
  .strict()
export type DestinationScope = z.infer<typeof DestinationScopeSchema>

export function verticalInScope(scope: DestinationScope, vertical: string): boolean {
  return !scope.verticals || Object.hasOwn(scope.verticals, vertical)
}

export function typeInScope(
  scope: DestinationScope,
  vertical: string,
  resourceType: string,
): boolean {
  if (!scope.verticals) return true
  const allowed = scope.verticals[vertical]
  if (allowed === undefined) return false
  return allowed === '*' || allowed.includes(resourceType)
}

// ── Export shapes ────────────────────────────────────────────────────────

export type ScalarValue = string | number | boolean

/**
 * One exported record. The fixed columns are the same for every resource
 * type; `fields` holds the masked record's top-level scalar fields under
 * sanitised (`[a-z0-9_]`) names, flattened next to them for BI tools.
 */
export interface ExportRow {
  _pk: string
  connection_id: string | null
  owner_tenant_id: string | null
  platform: string
  vertical: string
  resource_type: string
  resource_id: string
  /** Epoch ms — the store's change watermark for this row. */
  changed_at: number
  norm_version: string | null
  _deleted: boolean
  /** The masked record, JSON-encoded. */
  data: string
  fields: Record<string, ScalarValue>
}

/**
 * What a tombstone deletes. `record` names one row; the wider kinds follow
 * the store's NULL-widening (see `resource_tombstones`): a whole connection's
 * rows on one platform, a whole vertical, or everything.
 */
export type DeleteScope = 'record' | 'connection' | 'vertical' | 'all'

export interface DeleteSpec {
  tombstoneId: number
  scope: DeleteScope
  /** The row's `_pk` for a `record` delete, else null. */
  pk: string | null
  vertical: string | null
  platform: string | null
  connectionId: string | null
  ownerTenantId: string | null
  resourceType: string | null
  resourceId: string | null
  /** Epoch ms. Only rows with `changed_at <= deleted_at` are affected. */
  deletedAt: number
}

/** A Postgres/warehouse table: one per (vertical, resource type). */
export interface TableTarget {
  vertical: string
  resourceType: string
}

// ── Sinks ────────────────────────────────────────────────────────────────

/** Where an object-store sink puts files. Paths are relative to its prefix. */
export interface ObjectStoreSink {
  readonly kind: 'object_store'
  /** Prove the credentials can write: puts a small probe object. */
  test(): Promise<void>
  writeFile(path: string, bytes: Uint8Array, contentType: string): Promise<void>
  /**
   * Remove a file this sink wrote (missing is not an error). The warehouse
   * loaders use it to clean up their staged files; the export worker never
   * deletes — exported files are immutable.
   */
  deleteFile?(path: string): Promise<void>
  close(): Promise<void>
}

export interface TableSink {
  readonly kind: 'table'
  /** Prove the credentials can connect and create in the schema. */
  test(): Promise<void>
  /**
   * Upsert `rows` into the target's table (created if missing) and apply
   * `deletes` to it, in one transaction.
   */
  applyBatch(
    target: TableTarget,
    rows: ExportRow[],
    deletes: DeleteSpec[],
  ): Promise<{ upserted: number; deleted: number }>
  close(): Promise<void>
}

export type Sink = ObjectStoreSink | TableSink

/** Resolves a host before a sink dials it; throws to refuse. */
export type HostGuard = (host: string) => Promise<void>

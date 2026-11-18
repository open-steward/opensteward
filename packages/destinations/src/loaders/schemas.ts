/**
 * Config and secret schemas for the warehouse loaders (Snowflake, BigQuery,
 * Databricks) and the experimental Iceberg destination.
 *
 * Every name that ends up inside SQL — databases, schemas, datasets,
 * catalogs, storage integrations, credentials — is held to a strict
 * allow-list here, and checked again where the SQL is built
 * (`./sql.ts`), so a config that reached the store some other way still
 * cannot inject. Values that vary per row are always bound parameters.
 *
 * Loaders stage their Parquet files in an object store the warehouse can
 * read (`stage`), so their secrets carry the stage's credentials next to
 * the warehouse's, under `stage*` names.
 */
import { z } from 'zod'
import { parseStageUrl } from './stage-url'

// ── Shared pieces ────────────────────────────────────────────────────────

/** Snowflake-style identifier: resolved like an unquoted name (upper-cased). */
export const SNOWFLAKE_IDENT = /^[A-Za-z_][A-Za-z0-9_$]{0,254}$/
/** Databricks / Unity Catalog identifier (catalog, schema, credential). */
export const DATABRICKS_IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,254}$/
/** BigQuery dataset id. */
export const BIGQUERY_DATASET = /^[A-Za-z_][A-Za-z0-9_]{0,1023}$/
/** BigQuery project id, optionally domain-scoped (`example.com:my-project`). */
export const BIGQUERY_PROJECT = /^(?:[a-z0-9][a-z0-9.-]{0,62}:)?[a-z][a-z0-9-]{4,28}[a-z0-9]$/
/** A bare host name (no scheme, port or path). */
export const HOSTNAME =
  /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/

const PathPrefix = z
  .string()
  .max(512)
  .regex(/^[A-Za-z0-9._\-=/]*$/, 'Prefix may contain letters, digits, . _ - = and /')
  .refine((p) => !p.split('/').includes('..'), 'Prefix may not contain `..` segments')

const HttpUrl = z
  .string()
  .url()
  .max(2048)
  .refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL')

function jsonObject(max: number, what: string) {
  return z
    .string()
    .min(2)
    .max(max)
    .refine((s) => {
      try {
        const v = JSON.parse(s) as unknown
        return typeof v === 'object' && v !== null && !Array.isArray(v)
      } catch {
        return false
      }
    }, `Must be a ${what} JSON object`)
}

// ── Stage (where Parquet files are staged for the warehouse) ─────────────

export const STAGE_TYPES = ['s3', 'gcs', 'azure'] as const
export type StageType = (typeof STAGE_TYPES)[number]

const StageBase = {
  type: z
    .enum(STAGE_TYPES)
    .describe('Object store the staged Parquet files go to: `s3`, `gcs` or `azure`.'),
  url: z
    .string()
    .min(6)
    .max(1024)
    .describe(
      'Staging location, e.g. `s3://bucket/prefix/`, `gcs://bucket/prefix/` (or `gs://`), ' +
        '`azure://<account>.blob.core.windows.net/<container>/prefix/` (or ' +
        '`abfss://<container>@<account>.dfs.core.windows.net/prefix/`). The warehouse must be able to read it.',
    ),
  region: z
    .string()
    .regex(/^[a-z0-9-]{1,64}$/, 'An AWS region such as `us-east-1`')
    .optional()
    .describe('S3 bucket region (default `us-east-1`). S3 only.'),
}

function stageRefine(stage: { type: StageType; url: string }, ctx: z.RefinementCtx): void {
  try {
    const parsed = parseStageUrl(stage.url)
    if (parsed.type !== stage.type) {
      ctx.addIssue({
        code: 'custom',
        path: ['url'],
        message: `A ${parsed.type} URL does not match stage type \`${stage.type}\`.`,
      })
    }
  } catch (err) {
    ctx.addIssue({ code: 'custom', path: ['url'], message: (err as Error).message })
  }
}

export const SnowflakeStageSchema = z
  .object({
    ...StageBase,
    storageIntegration: z
      .string()
      .regex(SNOWFLAKE_IDENT, 'A Snowflake identifier')
      .optional()
      .describe(
        'Snowflake storage integration that can read the stage location. Recommended; required for GCS. ' +
          'Without it, S3 and Azure stages pass the stage credentials inside the COPY statement.',
      ),
  })
  .strict()
  .superRefine(stageRefine)

export const DatabricksStageSchema = z
  .object({
    ...StageBase,
    credentialName: z
      .string()
      .regex(DATABRICKS_IDENT, 'A Unity Catalog identifier')
      .optional()
      .describe(
        'Unity Catalog storage credential for `COPY INTO … WITH (CREDENTIAL …)`. Omit when an external location already grants the warehouse read access.',
      ),
  })
  .strict()
  .superRefine(stageRefine)

export const IcebergStorageSchema = z
  .object({
    ...StageBase,
    endpoint: HttpUrl.optional().describe(
      'Custom S3-compatible endpoint (MinIO, R2, …). S3 only; omit for AWS.',
    ),
    forcePathStyle: z.boolean().default(false).describe('Path-style S3 URLs (MinIO). S3 only.'),
  })
  .strict()
  .superRefine(stageRefine)

/** Credentials the loader uploads staged files with (the warehouse reads them its own way). */
const StageSecrets = {
  stageAccessKeyId: z
    .string()
    .regex(/^[A-Za-z0-9]{8,128}$/, 'An access key id')
    .optional()
    .describe('S3 stage: access key id. Omit (with the secret) for the default AWS chain.'),
  stageSecretAccessKey: z
    .string()
    .regex(/^[A-Za-z0-9/+=]{8,512}$/, 'A secret access key')
    .optional()
    .describe('S3 stage: secret access key.'),
  stageSessionToken: z
    .string()
    .regex(/^[A-Za-z0-9/+=]{8,4096}$/, 'A session token')
    .optional()
    .describe('S3 stage: session token (temporary credentials).'),
  stageCredentialsJson: jsonObject(20_000, 'service-account key')
    .optional()
    .describe('GCS stage: service-account key JSON. Omit for Application Default Credentials.'),
  stageAccountKey: z
    .string()
    .regex(/^[A-Za-z0-9/+=]{8,512}$/, 'A storage account key')
    .optional()
    .describe('Azure stage: storage account key.'),
  stageSasToken: z
    .string()
    .regex(/^\??[A-Za-z0-9%&=:._+\-/]{8,4096}$/, 'A SAS token')
    .optional()
    .describe('Azure stage: container SAS token (read, write, create, delete, list).'),
}

function stageSecretsRefine(
  s: { stageAccessKeyId?: string; stageSecretAccessKey?: string },
  ctx: z.RefinementCtx,
): void {
  if ((s.stageAccessKeyId === undefined) !== (s.stageSecretAccessKey === undefined)) {
    ctx.addIssue({
      code: 'custom',
      message: 'stageAccessKeyId and stageSecretAccessKey must be set together',
    })
  }
}

// ── Snowflake ────────────────────────────────────────────────────────────

export const SnowflakeConfigSchema = z
  .object({
    account: z
      .string()
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9_.-]{0,254}$/,
        'An account identifier such as `myorg-myaccount` or `xy12345.us-east-2.aws`',
      )
      .refine((a) => !a.includes('..'), 'Not a valid account identifier')
      .describe(
        'Account identifier (`<org>-<account>`, or a locator such as `xy12345.eu-west-1`).',
      ),
    host: z
      .string()
      .regex(HOSTNAME, 'A host name')
      .optional()
      .describe(
        'Override the account host (PrivateLink, `.snowflakecomputing.cn`). Default `<account>.snowflakecomputing.com`.',
      ),
    warehouse: z
      .string()
      .regex(SNOWFLAKE_IDENT, 'A Snowflake identifier')
      .describe('Virtual warehouse that runs the loads.'),
    database: z.string().regex(SNOWFLAKE_IDENT, 'A Snowflake identifier').describe('Database.'),
    schema: z
      .string()
      .regex(SNOWFLAKE_IDENT, 'A Snowflake identifier')
      .describe('Schema the `OS_<VERTICAL>_<TYPE>` tables are created in. Must exist.'),
    role: z
      .string()
      .regex(SNOWFLAKE_IDENT, 'A Snowflake identifier')
      .optional()
      .describe('Role to use. Default: the user’s default role.'),
    stage: SnowflakeStageSchema,
  })
  .strict()

export const SnowflakeSecretsSchema = z
  .object({
    username: z.string().min(1).max(255).describe('Snowflake user.'),
    password: z.string().min(1).max(1024).optional().describe('Password (or use privateKey).'),
    privateKey: z
      .string()
      .min(64)
      .max(20_000)
      .refine((k) => k.includes('PRIVATE KEY-----'), 'A PEM-encoded private key')
      .optional()
      .describe('PEM private key for key-pair authentication (recommended).'),
    privateKeyPassphrase: z
      .string()
      .min(1)
      .max(1024)
      .optional()
      .describe('Passphrase of an encrypted privateKey.'),
    ...StageSecrets,
  })
  .strict()
  .superRefine((s, ctx) => {
    if ((s.password === undefined) === (s.privateKey === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'Set exactly one of password or privateKey' })
    }
    stageSecretsRefine(s, ctx)
  })

// ── BigQuery ─────────────────────────────────────────────────────────────

export const BigQueryConfigSchema = z
  .object({
    projectId: z
      .string()
      .regex(BIGQUERY_PROJECT, 'A Google Cloud project id')
      .describe('Project the dataset (and the load/query jobs) belong to.'),
    dataset: z
      .string()
      .regex(BIGQUERY_DATASET, 'Letters, digits and _')
      .describe('Dataset the `os_<vertical>_<type>` tables are created in. Must exist.'),
    location: z
      .string()
      .regex(/^[A-Za-z0-9-]{1,64}$/, 'A BigQuery location such as `US` or `europe-west1`')
      .optional()
      .describe('Dataset location. Required unless the dataset is in `US` or `EU`.'),
    gcsBucket: z
      .string()
      .regex(/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/, 'A bucket name')
      .describe('GCS bucket the Parquet files are staged in (same location as the dataset).'),
    gcsPrefix: PathPrefix.default('').describe('Key prefix inside the bucket. Optional.'),
  })
  .strict()

export const BigQuerySecretsSchema = z
  .object({
    serviceAccountJson: jsonObject(20_000, 'service-account key')
      .optional()
      .describe(
        'Service-account key JSON, used for BigQuery and the GCS bucket. Omit for Application Default Credentials.',
      ),
  })
  .strict()

// ── Databricks ───────────────────────────────────────────────────────────

export const DatabricksConfigSchema = z
  .object({
    host: z
      .string()
      .regex(HOSTNAME, 'A host name without scheme, e.g. `dbc-1234.cloud.databricks.com`')
      .describe('Workspace host name, without `https://`.'),
    httpPath: z
      .string()
      .regex(/^\/[A-Za-z0-9._\-/]{1,500}$/, 'An HTTP path such as `/sql/1.0/warehouses/abc123`')
      .describe('SQL warehouse HTTP path (Connection details tab).'),
    catalog: z
      .string()
      .regex(DATABRICKS_IDENT, 'A catalog name')
      .optional()
      .describe('Unity Catalog catalog. Omit for the workspace default.'),
    schema: z
      .string()
      .regex(DATABRICKS_IDENT, 'A schema name')
      .describe('Schema the Delta tables are created in. Must exist.'),
    stage: DatabricksStageSchema,
  })
  .strict()

export const DatabricksSecretsSchema = z
  .object({
    token: z
      .string()
      .min(8)
      .max(4096)
      .describe('Personal access token or service-principal token.'),
    ...StageSecrets,
  })
  .strict()
  .superRefine(stageSecretsRefine)

// ── Iceberg (experimental) ───────────────────────────────────────────────

export const IcebergConfigSchema = z
  .object({
    catalogUri: HttpUrl.describe(
      'Iceberg REST catalog base URL (the part before `/v1/…`), e.g. `https://polaris.example.com/api/catalog`.',
    ),
    warehouse: z
      .string()
      .min(1)
      .max(1024)
      .refine(
        (w) => [...w].every((ch) => ch.charCodeAt(0) > 0x20 && ch.charCodeAt(0) !== 0x7f),
        'No spaces or control characters',
      )
      .optional()
      .describe('Warehouse name or location passed to `GET /v1/config?warehouse=`.'),
    namespace: z
      .string()
      .regex(
        /^[A-Za-z_][A-Za-z0-9_]{0,254}(?:\.[A-Za-z_][A-Za-z0-9_]{0,254}){0,7}$/,
        'Dot-separated identifiers, e.g. `opensteward` or `lake.opensteward`',
      )
      .default('opensteward')
      .describe('Namespace the tables are created in. Created if missing.'),
    storage: IcebergStorageSchema,
  })
  .strict()

export const IcebergSecretsSchema = z
  .object({
    token: z
      .string()
      .min(1)
      .max(8192)
      .regex(/^[\x21-\x7e]+$/, 'A bearer token')
      .optional()
      .describe('Bearer token for the REST catalog.'),
    ...StageSecrets,
  })
  .strict()
  .superRefine(stageSecretsRefine)

export type SnowflakeStage = z.infer<typeof SnowflakeStageSchema>
export type DatabricksStage = z.infer<typeof DatabricksStageSchema>
export type IcebergStorage = z.infer<typeof IcebergStorageSchema>
export type SnowflakeConfig = z.infer<typeof SnowflakeConfigSchema>
export type SnowflakeSecrets = z.infer<typeof SnowflakeSecretsSchema>
export type BigQueryConfig = z.infer<typeof BigQueryConfigSchema>
export type BigQuerySecrets = z.infer<typeof BigQuerySecretsSchema>
export type DatabricksConfig = z.infer<typeof DatabricksConfigSchema>
export type DatabricksSecrets = z.infer<typeof DatabricksSecretsSchema>
export type IcebergConfig = z.infer<typeof IcebergConfigSchema>
export type IcebergSecrets = z.infer<typeof IcebergSecretsSchema>
/** The `stage*` credential fields every staged loader accepts. */
export type StageSecretValues = Partial<Record<keyof typeof StageSecrets, string>>

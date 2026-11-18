/**
 * Build the sink for a destination from its (validated) config and secrets:
 * object stores and Postgres here, warehouse loaders from ../loaders.
 */
import {
  DestinationConfigError,
  type AzureBlobConfig,
  type AzureBlobSecrets,
  type GcsConfig,
  type GcsSecrets,
  type HostGuard,
  type PostgresConfig,
  type PostgresSecrets,
  type S3Config,
  type S3Secrets,
  type Sink,
} from '../types'
import {
  createBigQueryLoader,
  createDatabricksLoader,
  createIcebergLoader,
  createSnowflakeLoader,
  type BigQueryConfig,
  type BigQuerySecrets,
  type DatabricksConfig,
  type DatabricksSecrets,
  type IcebergConfig,
  type IcebergSecrets,
  type SnowflakeConfig,
  type SnowflakeSecrets,
} from '../loaders'
import { createAzureBlobSink } from './azure'
import { createGcsSink } from './gcs'
import { createPostgresSink } from './postgres'
import { createS3Sink } from './s3'

export { createS3Sink, type S3ClientLike, type S3SinkDeps } from './s3'
export { createGcsSink } from './gcs'
export { createAzureBlobSink } from './azure'
export { createPostgresSink, tableNameFor, quoteIdent, MAX_FLATTENED_COLUMNS } from './postgres'
export { connectionTestPath } from './common'

export interface SinkDeps {
  hostGuard: HostGuard
}

export async function createSink(
  type: string,
  config: Record<string, unknown>,
  secrets: Record<string, string>,
  deps: SinkDeps,
): Promise<Sink> {
  switch (type) {
    case 's3':
      return createS3Sink(config as S3Config, secrets as S3Secrets, deps)
    case 'gcs':
      return createGcsSink(config as GcsConfig, secrets as GcsSecrets, deps)
    case 'azure_blob':
      return createAzureBlobSink(config as AzureBlobConfig, secrets as AzureBlobSecrets, deps)
    case 'postgres':
      return createPostgresSink(config as PostgresConfig, secrets as PostgresSecrets, deps)
    case 'snowflake':
      return createSnowflakeLoader(config as SnowflakeConfig, secrets as SnowflakeSecrets, deps)
    case 'bigquery':
      return createBigQueryLoader(config as BigQueryConfig, secrets as BigQuerySecrets, deps)
    case 'databricks':
      return createDatabricksLoader(config as DatabricksConfig, secrets as DatabricksSecrets, deps)
    case 'iceberg':
      return createIcebergLoader(config as IcebergConfig, secrets as IcebergSecrets, deps)
    default:
      throw new DestinationConfigError(`Destination type '${type}' is not supported.`)
  }
}

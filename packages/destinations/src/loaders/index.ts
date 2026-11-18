/**
 * Warehouse loaders (Snowflake, BigQuery, Databricks) and the experimental
 * Iceberg destination. Each stages Parquet in an object store and finishes
 * with a warehouse-side load (see ./engine.ts for the shared flow).
 */
export {
  createLoaderSink,
  dedupeRows,
  planNewColumns,
  recordDeletes,
  wideDeletes,
  LOADER_FIXED_COLUMNS,
  STAGE_DIR,
  type LoaderDriver,
  type LoaderSinkOptions,
} from './engine'
export {
  createStage,
  type Stage,
  type StageDeps,
  type StagedFile,
  type StageLocation,
} from './stage'
export { parseStageUrl, renderStageUrl, type ParsedStageUrl, type UrlDialect } from './stage-url'
export { snowflakeIdent, databricksIdent, bigqueryIdent, sqlLiteral } from './sql'
export {
  createSnowflakeLoader,
  snowflakeHost,
  type SnowflakeClientLike,
  type SnowflakeConnectOptions,
  type SnowflakeLoaderDeps,
} from './snowflake'
export {
  createBigQueryLoader,
  type BigQueryClientLike,
  type BigQueryClientOptions,
  type BigQueryLoaderDeps,
} from './bigquery'
export {
  createDatabricksLoader,
  type DatabricksClientLike,
  type DatabricksConnectOptions,
  type DatabricksLoaderDeps,
} from './databricks'
export {
  createIcebergLoader,
  IcebergCatalogError,
  initialIcebergFields,
  nameMapping,
  type IcebergLoaderDeps,
} from './iceberg'
export * from './schemas'

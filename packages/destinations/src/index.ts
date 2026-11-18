/**
 * @opensteward/destinations — export the data store to warehouses and lakes.
 *
 *   types      destination types, per-type config/secret schemas, scope, sinks
 *   transform  stored record → masked export row (+ flattened columns)
 *   writers    Parquet encoding (apache-arrow + parquet-wasm)
 *   sinks      S3 (+ compatibles), GCS, Azure Blob, Postgres
 *   loaders    Snowflake, BigQuery, Databricks (staged Parquet + MERGE),
 *              Iceberg REST catalog (experimental, iceberg-ready files)
 *   store      destinations / cursors / runs tables on the data-store handle
 *   worker     the leased, at-least-once export loop
 *   catalog    the type catalog the admin API serves
 */
export * from './types'
export * from './transform'
export * from './hosts'
export * from './catalog'
export {
  rowsToParquet,
  deletesToParquet,
  readParquetRows,
  rowColumns,
  inferKind,
  coerceToKind,
  DELETE_COLUMNS,
  PARQUET_CONTENT_TYPE,
  type ColumnKind,
  type FlatColumn,
  type ParquetCompression,
  type ParquetReadResult,
  type RowsParquetOptions,
} from './writers/parquet'
export * from './sinks'
export * from './loaders'
export {
  DestinationStore,
  DESTINATIONS_SALT,
  TOMBSTONE_CURSOR_KEY,
  DEFAULT_INTERVAL_SEC,
  MIN_INTERVAL_SEC,
  MAX_INTERVAL_SEC,
  truncateError,
  type CreateDestinationInput,
  type CursorRow,
  type DestinationRecord,
  type RunFile,
  type RunRecord,
  type RunStatus,
  type RunTrigger,
  type UpdateDestinationInput,
} from './store'
export {
  DestinationWorker,
  DestinationNotFoundError,
  LeaseHeldError,
  writesFiles,
  type ChangeFeed,
  type ConnectionDirectory,
  type ConnectionInfo,
  type DestinationWorkerOptions,
  type RunSummary,
  type SinkFactory,
  type WorkerLogger,
} from './worker'

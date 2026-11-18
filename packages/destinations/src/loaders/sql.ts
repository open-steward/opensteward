/**
 * SQL building blocks for the warehouse loaders: identifier quoting behind
 * strict allow-lists, and the few string literals that cannot be bound
 * (storage URLs and file names inside `COPY INTO`, which none of the three
 * warehouses accept as bind parameters).
 *
 * The rule: a name reaches SQL only after matching an allow-list, and is
 * quoted even then; a literal reaches SQL only when it contains no quote,
 * backslash or control character. Everything else is a bound parameter.
 */
import { DestinationConfigError } from '../types'
import { BIGQUERY_DATASET, BIGQUERY_PROJECT, DATABRICKS_IDENT, SNOWFLAKE_IDENT } from './schemas'

/** Column and table names the loaders generate: `[a-z0-9_]`, never empty. */
const GENERATED = /^[a-z_][a-z0-9_]{0,254}$/

function refuse(what: string, value: string): never {
  // Echo at most a short, printable prefix — the value may be hostile.
  const shown = value.replace(/[^\x20-\x7e]/g, '?').slice(0, 40)
  throw new DestinationConfigError(`Invalid ${what}: '${shown}'.`, [
    { path: what, message: 'Not an allowed identifier' },
  ])
}

/**
 * A Snowflake identifier, quoted and upper-cased — exactly what the same
 * name unquoted resolves to, but safe for reserved words (`"ORDER"`).
 */
export function snowflakeIdent(name: string, what = 'identifier'): string {
  if (!SNOWFLAKE_IDENT.test(name)) refuse(what, name)
  return `"${name.toUpperCase()}"`
}

/** A Databricks identifier in backticks. */
export function databricksIdent(name: string, what = 'identifier'): string {
  if (!DATABRICKS_IDENT.test(name)) refuse(what, name)
  return `\`${name}\``
}

/** A BigQuery project, dataset, table or column in backticks. */
export function bigqueryIdent(
  name: string,
  kind: 'project' | 'dataset' | 'table' | 'column',
): string {
  const ok =
    kind === 'project'
      ? BIGQUERY_PROJECT.test(name)
      : kind === 'dataset'
        ? BIGQUERY_DATASET.test(name)
        : GENERATED.test(name)
  if (!ok) refuse(kind, name)
  return `\`${name}\``
}

/** A table or column name the loader generated itself. */
export function assertGenerated(name: string, what = 'column'): string {
  if (!GENERATED.test(name)) refuse(what, name)
  return name
}

const SAFE_LITERAL = /^[A-Za-z0-9 _.\-/=:%&+@,?]*$/

/**
 * A single-quoted literal for a value that cannot be bound. Refuses any
 * quote, backslash, semicolon or control character rather than escaping.
 */
export function sqlLiteral(value: string, what = 'value'): string {
  if (!SAFE_LITERAL.test(value)) refuse(what, value)
  return `'${value}'`
}

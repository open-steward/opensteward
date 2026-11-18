/**
 * The destination type catalog: what the admin UI needs to render a form per
 * type — each config and secret field with its type, default and
 * description, as JSON Schema generated from the Zod schemas that validate
 * the same input.
 */
import { z } from 'zod'
import { TYPE_SCHEMAS, IMPLEMENTED_TYPES, type DestinationType } from './types'

export interface CatalogEntry {
  type: DestinationType
  label: string
  /**
   * `object_store` writes Parquet files, `table` upserts rows directly,
   * `loader` stages Parquet and loads it warehouse-side.
   */
  kind: 'object_store' | 'table' | 'loader'
  /** Every listed type can be created. */
  available: boolean
  /** Works, but its behaviour and output format may still change (Iceberg). */
  experimental: boolean
  configSchema: Record<string, unknown> | null
  secretsSchema: Record<string, unknown> | null
  /** Names of the write-only fields. */
  secretFields: string[]
}

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  // `io: 'input'` — fields with defaults are optional for a caller.
  return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>
}

let cached: CatalogEntry[] | undefined

export function destinationCatalog(): CatalogEntry[] {
  cached ??= IMPLEMENTED_TYPES.map((type): CatalogEntry => {
    const s = TYPE_SCHEMAS[type]
    const secretsSchema = jsonSchema(s.secrets)
    return {
      type,
      label: s.label,
      kind: s.kind,
      available: true,
      experimental: s.experimental === true,
      configSchema: jsonSchema(s.config),
      secretsSchema,
      secretFields: Object.keys((secretsSchema['properties'] as object | undefined) ?? {}),
    }
  })
  return cached
}

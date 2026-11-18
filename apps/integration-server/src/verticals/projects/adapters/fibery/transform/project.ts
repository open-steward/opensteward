/**
 * Fibery Database → Project.
 *
 * Each domain Database returned by `fibery.schema/query` is a Project. Get
 * Schema (https://developers.fibery.com/guides/http-api/schema) returns, per
 * Database, `fibery/name`, `fibery/id`, `fibery/fields` and `fibery/meta`;
 * Databases (https://developers.fibery.com/guides/http-api/databases) gives
 * the name as "Database name in `${space}/${name}` format" and meta
 * `ui/color` as the "HEX color to use in Entity badges".
 *
 * The schema documents no status, archived flag, owner or dates for a
 * Database, so status is `unknown` and the rest are left out.
 */
import type { Project } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFiberyType {
  /** UUID of the Database. */
  'fibery/id': string
  /** `${space}/${name}`, e.g. "Cricket/Player". */
  'fibery/name': string
  'fibery/meta'?: {
    'fibery/domain?'?: boolean
    'ui/color'?: string
    [key: string]: unknown
  }
  'fibery/fields'?: unknown[]
  [key: string]: unknown
}

export function transformProject(raw: RawFiberyType, workspaceId: string): Project {
  const id = raw['fibery/id']
  const dbName = raw['fibery/name']
  const slash = dbName.indexOf('/')
  const spaceName = slash === -1 ? undefined : dbName.slice(0, slash)
  const name = slash === -1 ? dbName : dbName.slice(slash + 1)

  return {
    id,
    externalId: id,
    workspaceId,
    name,
    status: 'unknown',
    platform: 'fibery',
    metadata: strMap({
      dbName,
      spaceName,
      fieldCount: raw['fibery/fields'] ? String(raw['fibery/fields'].length) : undefined,
      color: pickStr(raw['fibery/meta']?.['ui/color']),
    }),
    raw,
  }
}

/**
 * Fibery workspace transform.
 *
 * In Fibery there is exactly one workspace per account. We derive it from the
 * fibery.schema/query response (the top-level object has `fibery/id` and
 * `fibery/meta`). The workspace name is the account subdomain stored in
 * `credentials.extra.account`.
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFiberyWorkspace {
  /** UUID of the workspace — top-level `fibery/id` from schema query. */
  'fibery/id': string
  /** Workspace metadata (contains version info, etc.). */
  'fibery/meta'?: Record<string, unknown>
  /** Number of databases (types) in the workspace. */
  typeCount?: number
  /** Account subdomain (injected by the adapter). */
  account?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawFiberyWorkspace): Workspace {
  const id = raw['fibery/id'] ?? ''
  const account = pickStr(raw['account']) ?? ''
  const version = pickStr(raw['fibery/meta']?.['version'] as string | undefined)

  return {
    id,
    externalId: id,
    name: account ? `${account}.fibery.io` : 'Fibery Workspace',
    platform: 'fibery',
    metadata: strMap({
      account,
      typeCount: raw['typeCount'],
      version,
    }),
    raw,
  }
}

import type { Project } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * A Quickbase **table** maps to the canonical Project — it groups the records
 * (tasks) and belongs to an app (workspace). Quickbase tables carry no
 * lifecycle/status flag, so status is reported as the unknown sentinel.
 * Docs: https://developer.quickbase.com/operation/getAppTables
 */
export interface RawQuickbaseTable {
  id: string
  name?: string
  alias?: string
  description?: string
  created?: string
  updated?: string
  nextRecordId?: number
  keyFieldId?: number
  singleRecordName?: string
  pluralRecordName?: string
  [key: string]: unknown
}

export function transformTable(raw: RawQuickbaseTable, appId?: string): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: appId ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: 'unknown',
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.updated),
    platform: 'quickbase',
    metadata: strMap({
      alias: raw.alias,
      keyFieldId: raw.keyFieldId,
      singleRecordName: raw.singleRecordName,
      pluralRecordName: raw.pluralRecordName,
    }),
    raw,
  }
}

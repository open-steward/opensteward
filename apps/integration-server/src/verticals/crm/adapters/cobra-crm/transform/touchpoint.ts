/**
 * cobra `TouchpointForDetailedDto` → canonical Activity.
 *
 * The `data` of GET /touchpoints/{id} ("Retrieve the details of an existing
 * touchpoint by its ID", https://apis.cobra-hilfe.de/api-7858744.md). Only
 * fields that schema declares are read.
 */
import type { Activity } from '../../../schema/activity'
import type { RawCobraMetaDataItem } from './person'

export interface RawCobraTouchpoint {
  id?: string | null
  topic?: string | null
  details?: string | null
  /** `AbstractChannelDto`: `identifier`, `touchType`, `channel`, `displayName`. */
  channel?: { touchType?: string | null; [key: string]: unknown } | null
  created?: RawCobraMetaDataItem | null
  modified?: RawCobraMetaDataItem | null
  [key: string]: unknown
}

function str(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

export function transformTouchpoint(raw: RawCobraTouchpoint): Activity {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error('cobra CRM touchpoint carried no id')
  }
  return {
    id: raw.id,
    type: str(raw.channel?.touchType),
    subject: str(raw.topic),
    note: str(raw.details),
    created_at: str(raw.created?.date),
    updated_at: str(raw.modified?.date),
    metadata: raw,
  }
}

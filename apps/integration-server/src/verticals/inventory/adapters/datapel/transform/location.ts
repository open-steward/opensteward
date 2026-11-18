/**
 * Transform a Datapel Breeze `locations` record into the canonical Location
 * shape.
 *
 * Field mapping based on the ccBreezeSDK Location domain model:
 *   locationsid      — numeric PK
 *   description      — location display name
 *   cardidentification — short code / identifier
 *   isinactive       — inverse active flag
 *   isconsignment    — consignment flag
 *   islocked         — locked flag
 *   comment          — free-text comment
 *   contact          — contact name
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawDatapelLocation {
  locationsid?: number | string
  description?: string
  cardidentification?: string
  isinactive?: boolean | string | number
  isconsignment?: boolean | string | number
  islocked?: boolean | string | number
  comment?: string
  contact?: string
  remoteid?: number | string
  [key: string]: unknown
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (v === 1 || v === '1' || v === 'true' || v === 'Y') return true
  return false
}

export function transformLocation(raw: RawDatapelLocation): Location {
  const id = String(raw.locationsid ?? '')
  const isInactive = toBool(raw.isinactive)
  return {
    id,
    externalId: id,
    name: pickStr(raw.description) ?? '',
    code: pickStr(raw.cardidentification),
    type: 'warehouse',
    isActive: !isInactive,
    platform: 'datapel',
    metadata: strMap({
      isconsignment: raw.isconsignment,
      islocked: raw.islocked,
      comment: raw.comment,
      contact: raw.contact,
      remoteid: raw.remoteid,
    }),
    raw,
  }
}

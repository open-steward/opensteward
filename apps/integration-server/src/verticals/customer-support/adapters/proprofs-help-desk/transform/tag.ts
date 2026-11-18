/**
 * Transform a ProProfs Help Desk label into the canonical Tag shape.
 *
 * Labels appear inside ticket responses under `labels[]`:
 *   { id: "1", name: "billing" }
 *
 * There is no dedicated "list labels" REST API endpoint; labels are
 * encountered when reading tickets.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawProprofsLabel {
  id?: string | number
  name?: string
  [key: string]: unknown
}

export function transformTag(raw: RawProprofsLabel): Tag {
  const id = raw.id != null ? String(raw.id) : (pickStr(raw.name) ?? '')

  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'proprofs-help-desk',
    metadata: strMap({}),
    raw,
  }
}

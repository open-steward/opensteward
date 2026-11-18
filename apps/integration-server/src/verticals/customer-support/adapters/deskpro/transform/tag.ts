/**
 * Deskpro label (tag) transform.
 *
 * Deskpro calls them "labels". They are string identifiers attached to tickets.
 * GET /api/v2/ticket-labels returns a list of labels used in the helpdesk.
 *
 * Each label object has at minimum: id (integer) and label (string name).
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw Deskpro label object as returned inside response.data for
 * GET /api/v2/ticket-labels.
 */
export interface RawDeskproLabel {
  id: number
  /** The label name / display string */
  label?: string
  /** Optional colour hex */
  color?: string | null
  [key: string]: unknown
}

export function transformTag(raw: RawDeskproLabel): Tag {
  const name = pickStr(raw.label) ?? String(raw.id)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name,
    platform: 'deskpro',
    metadata: strMap({ color: raw.color }),
    raw,
  }
}

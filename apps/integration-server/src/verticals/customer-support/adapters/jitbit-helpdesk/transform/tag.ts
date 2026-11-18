/**
 * Jitbit Helpdesk does not have a standalone tags/labels endpoint.
 * Tags are stored as a comma-separated string on each ticket.
 *
 * We synthesise Tag objects from the ticket tag strings. The tag ID and name
 * are both the tag string value (Jitbit has no numeric tag IDs).
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawJitbitTag {
  /** Tag name/value (the only available field). */
  name: string
  [key: string]: unknown
}

export function transformTag(raw: RawJitbitTag): Tag {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.name) ?? '',
    platform: 'jitbit-helpdesk',
    metadata: strMap({}),
    raw,
  }
}

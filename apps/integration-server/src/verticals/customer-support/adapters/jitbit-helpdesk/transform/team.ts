/**
 * Jitbit Helpdesk does not have a "teams" or "groups" resource.
 * The closest concept is a Category (department/queue). We map Categories to
 * the canonical Team schema so callers have a way to enumerate queues.
 *
 * GET /categories returns an array of category objects.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawJitbitCategory {
  CategoryID?: number
  Name?: string
  NameWithSection?: string
  Section?: string | null
  SectionID?: number | null
  ForTechsOnly?: boolean
  FromAddress?: string | null
  [key: string]: unknown
}

export function transformTeam(raw: RawJitbitCategory): Team {
  return {
    id: String(raw.CategoryID ?? ''),
    externalId: String(raw.CategoryID ?? ''),
    name: pickStr(raw.NameWithSection) ?? pickStr(raw.Name) ?? '',
    platform: 'jitbit-helpdesk',
    metadata: strMap({
      section: raw.Section,
      sectionId: raw.SectionID,
      forTechsOnly: raw.ForTechsOnly,
      fromAddress: raw.FromAddress,
    }),
    raw,
  }
}

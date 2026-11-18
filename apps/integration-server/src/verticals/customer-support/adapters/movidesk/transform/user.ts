/**
 * Movidesk (Zenvia Service) person → User (agent) transform.
 *
 * Agents are persons with profileType=1 or profileType=3.
 * Retrieved via GET /public/v1/persons?$filter=profileType eq 1
 *
 * Agent persons must belong to at least one team (required by Movidesk).
 * The `teams` expand (if requested) returns team name(s).
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'
import type {
  RawMovideskContactPerson,
  RawMovideskEmailEntry,
  RawMovideskContactEntry,
} from './contact'

export type { RawMovideskContactPerson as RawMovideskAgentPerson }

/** Optional teams array embedded via $expand=teams. */
interface RawMovideskTeamEntry {
  id?: number | null
  name?: string | null
  [key: string]: unknown
}

export interface RawMovideskAgent extends RawMovideskContactPerson {
  teams?: RawMovideskTeamEntry[] | null
  accessProfile?: string | null
  [key: string]: unknown
}

function pickDefaultEmail(
  entries: RawMovideskEmailEntry[] | null | undefined,
): string | undefined {
  if (!entries || entries.length === 0) return undefined
  const def = entries.find((e) => e.isDefault)
  return pickStr((def ?? entries[0])?.email)
}

// Suppress unused-param lint — kept for structural parity with contact transform
 
function _unusedPhone(_entries: RawMovideskContactEntry[] | null | undefined): undefined {
  return undefined
}

export function transformUser(raw: RawMovideskAgent): User {
  return {
    id: pickStr(raw.id) ?? '',
    externalId: pickStr(raw.codeReferenceAdditional ?? raw.id) ?? '',
    email: pickDefaultEmail(raw.emails),
    name: pickStr(raw.businessName) ?? '',
    role: pickStr(raw.accessProfile),
    teamIds: (raw.teams ?? []).map((t) => String(t.id ?? '')).filter(Boolean),
    platform: 'movidesk',
    metadata: strMap({
      profileType: raw.profileType,
      personType: raw.personType,
      isActive: raw.isActive,
    }),
    raw,
  }
}

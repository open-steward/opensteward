/**
 * Deskpro department (team) transform.
 *
 * Deskpro organises agents and tickets into Departments. The endpoint is
 * GET /api/v2/departments (or GET /api/v2/tickets/departments for the
 * ticket-scoped department list).
 *
 * Each department object has at minimum: id (integer) and title (string).
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw Deskpro department object as returned inside response.data for
 * GET /api/v2/departments.
 */
export interface RawDeskproDepartment {
  id: number
  /** Department display name */
  title?: string
  /** Optional description */
  description?: string | null
  [key: string]: unknown
}

export function transformTeam(raw: RawDeskproDepartment): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.title) ?? String(raw.id),
    platform: 'deskpro',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}

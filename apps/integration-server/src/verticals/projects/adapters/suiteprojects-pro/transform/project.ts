/**
 * Transform a raw SuiteProjects Pro project record into the canonical Project schema.
 *
 * Key OpenAir project fields used here:
 *   id          – integer, system-generated unique identifier
 *   name        – string, required, project name
 *   notes       – string, optional description/notes
 *   isActive    – Boolean, 1/0 active flag
 *   userId      – integer, project owner (employee) internal ID
 *   customerId  – integer, associated customer internal ID
 *   startDate   – string($date) YYYY-MM-DD
 *   finishDate  – string($date) YYYY-MM-DD, calculated finish date (read-only)
 *   created     – string($date-time), system-generated creation timestamp
 *   updated     – string($date-time), system-generated last-modified timestamp
 *   currency    – string, three-letter currency code
 *   budget      – number, budgeted revenue in major currency units (e.g. 1234.56 USD)
 *                 Stored in metadata as integer minor units (e.g. 123456 cents).
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso, pickNum } from './shared'

export interface RawSuiteProjectsProject {
  id?: number | string
  name?: string
  notes?: string
  isActive?: boolean | number
  userId?: number | string
  customerId?: number | string
  startDate?: string
  finishDate?: string
  created?: string
  updated?: string
  currency?: string
  budget?: number
  [key: string]: unknown
}

function mapStatus(raw: RawSuiteProjectsProject): ProjectStatus {
  // isActive === false / 0 means the project is inactive/archived
  if (raw.isActive === false || raw.isActive === 0) return 'archived'
  return 'active'
}

export function transformProject(raw: RawSuiteProjectsProject): Project {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    // SuiteProjects Pro has no workspace concept — use customerId as a proxy
    workspaceId: raw.customerId != null ? String(raw.customerId) : '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.notes),
    status: mapStatus(raw),
    ownerId: raw.userId != null ? String(raw.userId) : undefined,
    startDate: toIso(raw.startDate),
    endDate: toIso(raw.finishDate),
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.updated),
    platform: 'suiteprojects-pro',
    metadata: strMap({
      currency: raw.currency,
      // budget is a major-unit float from the API (e.g. 1234.56); canonical
      // money amounts are integer minor units (cents), so multiply × 100 and floor.
      budgetMinorUnits: (() => {
        const b = pickNum(raw.budget)
        return b != null ? Math.round(b * 100) : undefined
      })(),
      customerId: raw.customerId,
    }),
    raw,
  }
}

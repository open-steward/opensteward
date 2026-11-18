/**
 * Transform an InLoox OData `ApiProject` object into the canonical Project schema.
 *
 * InLoox project fields (from Microsoft Learn connector docs + Swagger):
 *   ProjectId       — UUID primary key
 *   Name            — project name
 *   DescriptionHTML — HTML description
 *   StartDate       — ISO 8601 date-time
 *   EndDate         — ISO 8601 date-time
 *   IsArchived      — boolean
 *   IsRecycled      — boolean (soft-deleted)
 *   Priority        — integer (higher = more important)
 *   ProjectStatusId — UUID of a status configuration
 *   PortfolioId     — UUID of parent portfolio (workspace proxy)
 *   ClientId        — UUID of client/customer contact
 *   DivisionId      — UUID of division
 *   LockMode        — integer
 *   RiskScore       — integer
 *   SizeScore       — integer
 *   ValueScore      — integer
 *   NumberPrefix    — project number prefix string
 *   NumberSuffix    — project number suffix string
 *   NumberIncremential — integer
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawInlooxProject {
  ProjectId?: string
  Name?: string
  DescriptionHTML?: string
  StartDate?: string
  EndDate?: string
  IsArchived?: boolean
  IsRecycled?: boolean
  Priority?: number
  ProjectStatusId?: string
  PortfolioId?: string
  ClientId?: string
  DivisionId?: string
  LockMode?: number
  RiskScore?: number
  SizeScore?: number
  ValueScore?: number
  NumberPrefix?: string
  NumberSuffix?: string
  NumberIncremential?: number
  [key: string]: unknown
}

function mapStatus(raw: RawInlooxProject): ProjectStatus {
  if (raw.IsArchived || raw.IsRecycled) return 'archived'
  return 'active'
}

export function transformProject(raw: RawInlooxProject): Project {
  const id = pickStr(raw.ProjectId) ?? ''
  return {
    id,
    externalId: id,
    workspaceId: pickStr(raw.PortfolioId) ?? '',
    name: pickStr(raw.Name) ?? '',
    description: pickStr(raw.DescriptionHTML),
    status: mapStatus(raw),
    ownerId: undefined,
    startDate: toIso(raw.StartDate),
    endDate: toIso(raw.EndDate),
    createdAt: undefined,
    updatedAt: undefined,
    platform: 'inloox',
    metadata: strMap({
      priority: raw.Priority,
      projectStatusId: raw.ProjectStatusId,
      clientId: raw.ClientId,
      divisionId: raw.DivisionId,
      lockMode: raw.LockMode,
      riskScore: raw.RiskScore,
      sizeScore: raw.SizeScore,
      valueScore: raw.ValueScore,
      numberPrefix: raw.NumberPrefix,
      numberSuffix: raw.NumberSuffix,
    }),
    raw,
  }
}

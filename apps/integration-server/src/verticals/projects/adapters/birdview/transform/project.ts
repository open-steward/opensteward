import type { Project, ProjectStatus } from '../../../schema'
import { strMap, toIso } from './shared'

/**
 * Birdview PSA `ProjectModel` (GET /api/v2/projects → `ProjectsResponse.Items`,
 * GET /api/v2/projects/{id}), per
 * https://app.go.easyprojects.net/api/swagger/v2/swagger.json:
 *   ProjectModel = allOf(ProjectIdModel {ProjectId}, {Name, Description,
 *   CreatorId, StartDate, EndDate, SpaceId, StatusId, PortfolioId,
 *   CreationDate, LastModificationDate, IsArchived, ...})
 * Only the fields read below are typed.
 */
export interface RawBirdviewProject {
  ProjectId: number
  Name: string
  Description?: string | null
  CreatorId?: number
  StartDate?: string | null
  EndDate?: string | null
  SpaceId?: number | null
  StatusId?: number | null
  PortfolioId?: number | null
  CreationDate?: string | null
  LastModificationDate?: string | null
  IsArchived?: boolean | null
  [key: string]: unknown
}

/**
 * Birdview `ProjectStatus` (GET /api/v2/lists/projectstatuses →
 * `ProjectStatusesResponse.Items`): {ProjectStatusId, Name, WorkflowId,
 * TreatAsCompleted, IsTemplate, IsDraftStatus, WorkflowIn, WorkflowOut}.
 * Project statuses are an account-defined list, so a StatusId means nothing
 * without its row.
 */
export interface RawBirdviewProjectStatus {
  ProjectStatusId: number
  Name?: string
  TreatAsCompleted?: boolean
  IsTemplate?: boolean
  IsDraftStatus?: boolean
  [key: string]: unknown
}

/**
 * Canonical status from the documented flags only:
 *   IsArchived            → archived
 *   TreatAsCompleted      → completed
 *   IsDraftStatus / IsTemplate, or no status row → unknown (no canonical match)
 *   any other status      → active
 * Birdview documents no on-hold flag for projects, so on_hold is never produced.
 */
function mapStatus(
  raw: RawBirdviewProject,
  status: RawBirdviewProjectStatus | undefined,
): ProjectStatus {
  if (raw.IsArchived === true) return 'archived'
  if (!status) return 'unknown'
  if (status.TreatAsCompleted === true) return 'completed'
  if (status.IsDraftStatus === true || status.IsTemplate === true) return 'unknown'
  return 'active'
}

/**
 * @param account the connection's account slug. Birdview has no workspace
 *   resource this adapter serves (a project's `SpaceId` is nullable), so every
 *   project belongs to the one account the connection reads; SpaceId is kept
 *   in metadata.
 * @param status the project's status row from /api/v2/lists/projectstatuses.
 */
export function transformProject(
  raw: RawBirdviewProject,
  account: string,
  status?: RawBirdviewProjectStatus,
): Project {
  if (raw.ProjectId == null) throw new Error('Birdview PSA project has no ProjectId')
  const id = String(raw.ProjectId)
  return {
    id,
    externalId: id,
    workspaceId: account,
    name: raw.Name,
    description: raw.Description ?? undefined,
    status: mapStatus(raw, status),
    startDate: toIso(raw.StartDate),
    endDate: toIso(raw.EndDate),
    createdAt: toIso(raw.CreationDate),
    updatedAt: toIso(raw.LastModificationDate),
    platform: 'birdview',
    metadata: strMap({
      statusId: raw.StatusId,
      statusName: status?.Name,
      spaceId: raw.SpaceId,
      portfolioId: raw.PortfolioId,
      creatorId: raw.CreatorId,
      isArchived: raw.IsArchived,
    }),
    raw,
  }
}

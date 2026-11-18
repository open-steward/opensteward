/**
 * Huly tracker Project (space) → canonical Project.
 *
 * Fields, from hcengineering/platform plugins/tracker/src/index.ts
 * (`interface Project extends TaskProject`: `identifier: string // Project
 * identifier`) and huly.core packages/core/src/classes.ts
 * (`interface Space extends Doc { name: string; description: string;
 * private: boolean; members: AccountUuid[]; archived: boolean; owners?:
 * AccountUuid[] }`, `interface Doc { _id; space; modifiedOn: Timestamp;
 * createdOn?: Timestamp }`). Timestamps are epoch milliseconds.
 *
 * Huly spaces carry no workspace field: the workspace is the connection's
 * (the API token is bound to one workspace).
 *
 * `owners` are AccountUuids, not the Person `_id` a User row is keyed by.
 * The caller resolves `owners[0]` to a Person through `BasePerson.personUuid`
 * (classes.ts: `personUuid?: PersonUuid`; `type AccountUuid = PersonUuid &
 * { __accountUuid: true }`) and passes it in; the raw uuid is kept in
 * `metadata.ownerAccountUuid`.
 */
import type { Project, ProjectStatus } from '../../../schema'
import { strMap, toIso } from './shared'

export interface RawHulyProject {
  _id: string
  _class: string
  space: string
  identifier?: string
  name: string
  description?: string
  private?: boolean
  archived?: boolean
  members?: string[]
  owners?: string[]
  createdOn?: number
  modifiedOn: number
  [key: string]: unknown
}

function mapStatus(raw: RawHulyProject): ProjectStatus {
  return raw.archived === true ? 'archived' : 'active'
}

export function transformProject(
  raw: RawHulyProject,
  workspaceId: string,
  ownerPersonId?: string,
): Project {
  return {
    id: raw._id,
    externalId: raw._id,
    workspaceId,
    name: raw.name,
    description: raw.description ? raw.description : undefined,
    status: mapStatus(raw),
    ownerId: ownerPersonId,
    createdAt: toIso(raw.createdOn),
    updatedAt: toIso(raw.modifiedOn),
    platform: 'huly',
    metadata: strMap({
      identifier: raw.identifier,
      private: raw.private,
      ownerAccountUuid: raw.owners?.[0],
    }),
    raw,
  }
}

/**
 * Transform a Process Street Workflow into the canonical Project shape.
 *
 * A Workflow is "the reusable definition — tasks, form fields, logic,
 * automations"; each maps to a canonical Project. Documented shape
 * (PublicApiWorkflow in https://public-api.process.st/api/v1.1/docs/openapi.json,
 * required: id, audit, name):
 *   id, name, description ("Optional long-form description of the workflow."),
 *   audit { createdDate, createdBy, updatedDate, updatedBy }, links[]
 *
 * The workflow object has no status field. GET /workflows is documented as
 * "Returns a list of active workflows.", so the list passes 'active'; GET
 * /workflows/{workflowId} says nothing about status, so it passes 'unknown'.
 *
 * workspaceId: the public API exposes no organisation id (GET /testAuth
 * returns only `apiKeyLabel`), so it stays empty.
 */
import type { Project, ProjectStatus } from '../../../schema'
import type { ProcessStreetLink } from '../client'
import { pickStr, strMap, toIso } from './shared'

/** PublicApiUser: "id", "email", "username" (all required). */
export interface RawProcessStreetUserRef {
  id: string
  email: string
  username: string
}

export interface RawProcessStreetWorkflow {
  id: string
  name: string
  description?: string
  audit: {
    createdDate: string
    createdBy?: RawProcessStreetUserRef
    updatedDate: string
    updatedBy?: RawProcessStreetUserRef
  }
  links?: ProcessStreetLink[]
}

export function transformProject(raw: RawProcessStreetWorkflow, status: ProjectStatus): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: '',
    name: raw.name,
    description: pickStr(raw.description),
    status,
    createdAt: toIso(raw.audit.createdDate),
    updatedAt: toIso(raw.audit.updatedDate),
    platform: 'process-street',
    metadata: strMap({
      createdById: raw.audit.createdBy?.id,
      updatedById: raw.audit.updatedBy?.id,
    }),
    raw,
  }
}

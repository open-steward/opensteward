/**
 * Field classification for every listable projects resource — see
 * docs/security/data-classification.md.
 */
import { FIELD_RULES as R, type ResourceClassification } from '@opensteward/shared'
import { ProjectSchema, WorkspaceSchema } from './index'

export const RESOURCE_SCHEMAS = {
  workspaces: WorkspaceSchema,
  projects: ProjectSchema,
}

export const CLASSIFICATION: Record<string, ResourceClassification> = {
  workspaces: { '*': R.internal },
  projects: { '*': R.internal, description: R.pii },
}

import type { Pipeline } from '../../../schema/pipeline'

/**
 * Vitally does not have a native Pipeline entity.
 *
 * We surface Vitally Organizations as pipelines since they provide a top-level
 * grouping hierarchy for accounts.
 * Docs: https://docs.vitally.io/en/articles/9880652-rest-api-organizations
 */
export interface RawVitallyOrganization {
  id: string
  externalId?: string | null
  name?: string | null
  traits?: Record<string, unknown>
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export function transformPipeline(raw: RawVitallyOrganization): Pipeline {
  return {
    id: String(raw.id),
    name: typeof raw.name === 'string' ? raw.name : '',
    created_at: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    updated_at: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    metadata: raw,
  }
}

import type { Pipeline } from '../../../schema/pipeline'

/**
 * Method CRM Opportunity Stage / Pipeline raw record shape.
 *
 * Method CRM does not expose a dedicated Pipeline resource via its REST API.
 * Opportunity stages are stored as lookup values rather than a structured
 * pipeline entity. We map an OpportunityStage lookup record to the canonical
 * Pipeline shape as a best-effort representation.
 *
 * Table name  : OpportunityStage (or pipeline configuration entries)
 * Key fields  : RecordId, Name, DisplayOrder, IsActive
 */
export interface RawMethodPipeline {
  RecordId: string | number
  Name?: string
  DisplayOrder?: number
  IsActive?: boolean
  [key: string]: unknown
}

export function transformPipeline(raw: RawMethodPipeline): Pipeline {
  return {
    id: String(raw.RecordId),
    name: typeof raw.Name === 'string' && raw.Name.length > 0 ? raw.Name : '',
    is_active: typeof raw.IsActive === 'boolean' ? raw.IsActive : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

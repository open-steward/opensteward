import type { Pipeline } from '../../../schema/pipeline'

/**
 * Recruiterflow pipeline object.
 *
 * Key fields:
 *   id   – pipeline ID
 *   name – pipeline name
 */
export interface RawRecruiterflowPipeline {
  id: string | number
  name?: string
  [key: string]: unknown
}

export function transformPipeline(raw: RawRecruiterflowPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    metadata: raw as Record<string, unknown>,
  }
}

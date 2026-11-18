import type { Pipeline } from '../../../schema/pipeline'

/**
 * Raw Manatal job-pipeline object from GET /job-pipelines/ or GET /job-pipelines/{id}/.
 * Manatal job pipelines define the hiring workflow stages for jobs.
 */
export interface RawManatalPipeline {
  id: number
  name?: string
  stages?: Array<{
    id: number
    name: string
    order?: number
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export function transformPipeline(raw: RawManatalPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    stages: (raw.stages ?? []).map((s) => ({
      id: String(s.id),
      name: s.name,
      order: s.order,
    })),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

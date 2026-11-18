import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

/**
 * A stage as "Get stage list" returns it (GET /api/v2/orderstages):
 * "id Number, read-only Stage ID name String, mandatory Stage description
 * probability Number, mandatory Default stage probability".
 */
export interface RawUpsalesStage {
  id: number | string
  name?: string
  probability?: number
  [key: string]: unknown
}

export function transformPipelineFromStages(stages: RawUpsalesStage[]): Pipeline {
  // No `order`: the documented stage properties (id, name, probability) carry
  // no position, and the list is read with sort=id, so an index would rank
  // stages by id rather than by their place in the sales process.
  const pipelineStages: PipelineStage[] = stages.map((s) => {
    if (typeof s.name !== 'string') {
      throw new Error(`Upsales stage ${s.id} has no name ("name String, mandatory")`)
    }
    return { id: String(s.id), name: s.name, win_probability: s.probability }
  })
  // The single 'default' pipeline is not an Upsales record: the API has stages
  // only. It predates the paging rebuild and is kept pending the lead's call.
  return {
    id: 'default',
    name: 'Default Pipeline',
    stages: pipelineStages,
    metadata: { stages },
  }
}

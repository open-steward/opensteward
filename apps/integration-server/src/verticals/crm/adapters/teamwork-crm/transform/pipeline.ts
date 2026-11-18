import type { Pipeline, PipelineStage } from '../../../schema/pipeline'
import { entityId, requiredString, str, type TeamworkRef } from '../raw'

/**
 * The Pipeline model of `GET /pipelines.json` (`pipelines[]`), documented
 * fields only
 * (https://web.archive.org/web/20200810124444id_/https://developer.teamwork.com/crm/api-reference/pipelines/get-pipelinesjson).
 * `stages` is a to-many relationship of `{ id, type: "stages" }`; the list
 * documents `include=stages`, which side-loads the Stage models under
 * `included.stages`.
 */
export interface RawTeamworkPipeline {
  id: number
  name: string
  stages?: TeamworkRef[] | null
  stagesCount?: number | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

/**
 * The Stage model of `GET /stages.json`
 * (https://web.archive.org/web/20200810124444id_/https://developer.teamwork.com/crm/api-reference/stages/get-stagesjson).
 */
export interface RawTeamworkStage {
  id: number
  name?: string | null
  /** "Lower numbers come first when retrieving multiple elements at once." */
  orderIndex?: number | null
  /** "A percentage that defines how much of the stage's value will be taken for the expected revenue in the forecast report." */
  probability?: number | null
  pipeline?: TeamworkRef | null
  [key: string]: unknown
}

/**
 * The pipeline's stages, in `orderIndex` order, only when the list is whole:
 * every stage id came back ("All of the items might not be returned ...
 * `stagesCount` containing the total number of items") and each one was
 * side-loaded with a name. Anything less is omitted rather than served short.
 */
function stagesOf(
  raw: RawTeamworkPipeline,
  included: RawTeamworkStage[],
): PipelineStage[] | undefined {
  const refs = raw.stages
  if (
    !Array.isArray(refs) ||
    typeof raw.stagesCount !== 'number' ||
    refs.length !== raw.stagesCount
  ) {
    return undefined
  }
  const byId = new Map(included.map((s) => [s.id, s]))
  const stages: RawTeamworkStage[] = []
  for (const ref of refs) {
    const stage = byId.get(ref.id)
    if (!stage || typeof stage.name !== 'string' || typeof stage.orderIndex !== 'number')
      return undefined
    stages.push(stage)
  }
  return stages
    .sort((a, b) => (a.orderIndex as number) - (b.orderIndex as number))
    .map((s, i) => ({
      id: String(s.id),
      name: s.name as string,
      order: i,
      win_probability:
        typeof s.probability === 'number' && s.probability >= 0 && s.probability <= 100
          ? s.probability
          : undefined,
    }))
}

export function transformPipeline(
  raw: RawTeamworkPipeline,
  included: RawTeamworkStage[] = [],
): Pipeline {
  return {
    id: entityId(raw, 'pipeline'),
    name: requiredString(raw.name, 'name', 'pipeline'),
    stages: stagesOf(raw, included),
    created_at: str(raw.createdAt),
    updated_at: str(raw.updatedAt),
    metadata: raw,
  }
}

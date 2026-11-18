import type { Pipeline, PipelineStage } from '../../../schema/pipeline'
import { espoDatetimeToIso } from './datetime'
import { requireString } from './required'

/**
 * An EspoCRM Pipeline record (v10.0+; https://docs.espocrm.com/general/pipelines/:
 * "Each pipeline has its unique stages. Each stage is mapped to the Status
 * field value. Each stage is stored as an entity.").
 *
 * Fields from the vendor's entity definition,
 * https://github.com/espocrm/espocrm/blob/master/application/Espo/Resources/metadata/entityDefs/Pipeline.json:
 * name (varchar, required), order (int), status (enum "Active" | "Inactive"),
 * entityType (enum, required), field (enum), createdAt, modifiedAt (datetime).
 */
export interface RawEspoCrmPipeline {
  id: string
  name: string
  order?: number | null
  status?: string | null
  entityType?: string
  field?: string | null
  createdAt?: string | null
  modifiedAt?: string | null
  [key: string]: unknown
}

/**
 * An EspoCRM PipelineStage record, from
 * .../entityDefs/PipelineStage.json: name (varchar, required), pipeline (link,
 * required), order (int), mappedStatus (enum, required).
 */
export interface RawEspoCrmPipelineStage {
  id: string
  name: string
  order?: number | null
  mappedStatus?: string | null
  [key: string]: unknown
}

/** `stages` in the order EspoCRM returned them (the adapter asks for `orderBy=order&order=asc`). */
function transformStage(raw: RawEspoCrmPipelineStage, index: number): PipelineStage {
  return {
    id: requireString(raw.id, 'PipelineStage.id'),
    name: requireString(raw.name, `PipelineStage ${String(raw.id)} name`),
    order: index,
  }
}

function isActive(status: string | null | undefined): boolean | undefined {
  if (status === 'Active') return true
  if (status === 'Inactive') return false
  return undefined
}

export function transformPipeline(
  raw: RawEspoCrmPipeline,
  stages: RawEspoCrmPipelineStage[],
): Pipeline {
  const createdAt = espoDatetimeToIso(raw.createdAt)
  const updatedAt = espoDatetimeToIso(raw.modifiedAt)
  const active = isActive(raw.status)
  return {
    id: requireString(raw.id, 'Pipeline.id'),
    name: requireString(raw.name, `Pipeline ${String(raw.id)} name`),
    stages: stages.map(transformStage),
    ...(active !== undefined ? { is_active: active } : {}),
    ...(createdAt ? { created_at: createdAt } : {}),
    ...(updatedAt ? { updated_at: updatedAt } : {}),
    metadata: { ...raw, stages },
  }
}

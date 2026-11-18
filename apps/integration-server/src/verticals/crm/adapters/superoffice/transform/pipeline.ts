import type { Pipeline, PipelineStage } from '../../../schema/pipeline'
import { positiveId, requireId } from '../values'

/**
 * A pipeline is a SuperOffice sale type: GET /api/v1/List/SaleType/Items
 * ("Gets a list of all SaleTypeEntity list items.") returns
 * SuperOffice.CRM.Services.SaleTypeEntity, whose documented properties
 * (openapi-v3-List.json) include:
 *   SaleTypeId — "Primary key"
 *   Name       — "The list item"
 *   Deleted    — "0 -> record is active 1 -> record is 'deleted' and should not be shown in lists"
 *   Stages     — "Stages, those associated with this SaleType are selected.
 *                 Use MDO List name "salestage" to get list items."
 * Each stage is a SelectableMDOListItem: Id ("The Id of the ListItem"),
 * Name ("The name of the ListItem"), Selected ("True if the ListItem is
 * selected"), Deleted ("The deleted status of the ListItem").
 *
 * A sale carries its type as SaleEntity.SaleType (Id) and its stage as
 * SaleEntity.Rating (Id) — the "Rating" list is the sale-stage list
 * (GET /api/v1/List/Rating/Items, "Get All Sale Stage Entity") — so deals
 * point at these ids.
 */
export interface RawSuperofficeSaleTypeStage {
  Id?: number
  Name?: string
  Selected?: boolean
  Deleted?: boolean
  [key: string]: unknown
}

export interface RawSuperofficeSaleType {
  SaleTypeId?: number
  Name?: string
  Deleted?: boolean
  Stages?: RawSuperofficeSaleTypeStage[]
  [key: string]: unknown
}

function transformStage(raw: RawSuperofficeSaleTypeStage): PipelineStage {
  const id = positiveId(raw.Id)
  if (id === undefined || typeof raw.Name !== 'string') {
    throw new Error(`SuperOffice sale type stage lacks Id or Name: ${JSON.stringify(raw)}`)
  }
  return { id, name: raw.Name }
}

export function transformPipeline(raw: RawSuperofficeSaleType): Pipeline {
  const id = requireId(raw.SaleTypeId, 'sale type')
  if (typeof raw.Name !== 'string') {
    throw new Error(`SuperOffice sale type ${id} has no Name`)
  }
  return {
    id,
    name: raw.Name,
    is_active: typeof raw.Deleted === 'boolean' ? !raw.Deleted : undefined,
    stages: Array.isArray(raw.Stages)
      ? raw.Stages.filter((s) => s.Selected === true && s.Deleted !== true).map(transformStage)
      : undefined,
    metadata: raw,
  }
}

import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

/**
 * A deal funnel, as `crm.category.list` / `crm.category.get` return it for
 * `entityTypeId` 2 (https://apidocs.bitrix24.com/api-reference/crm/universal/category/crm-category-list.html):
 * `{ "id": 0, "name": "General", "sort": 300, "entityTypeId": 2, "isDefault": "Y" }`.
 */
export interface RawBitrix24Category {
  id: number
  name: string
  sort?: number
  entityTypeId?: number
  isDefault?: 'Y' | 'N'
  originId?: string
  originatorId?: string
  [key: string]: unknown
}

/**
 * A deal stage, as `crm.dealcategory.stage.list` returns it. That method "is
 * equivalent to calling the crm.status.list method with the ENTITY_ID
 * parameter set to the result of the crm.dealcategory.status call", so its
 * rows are crm.status.list rows: `ID`, `ENTITY_ID`, `STATUS_ID` ("Status value
 * code"), `NAME`, `SORT` ("Sorting", a string), `SEMANTICS`, `CATEGORY_ID` …
 * (https://apidocs.bitrix24.com/api-reference/crm/status/crm-status-list.html).
 */
export interface RawBitrix24Stage {
  ID?: string
  ENTITY_ID?: string
  STATUS_ID: string
  NAME: string
  SORT: string
  CATEGORY_ID?: string | null
  SEMANTICS?: string | null
  [key: string]: unknown
}

/** Stages in `SORT` order; `order` is the 0-indexed position in that order. */
function transformStages(stages: RawBitrix24Stage[]): PipelineStage[] {
  return stages
    .map((raw, i) => ({ raw, i }))
    .sort((a, b) => Number(a.raw.SORT) - Number(b.raw.SORT) || a.i - b.i)
    .map(({ raw }, order) => ({ id: String(raw.STATUS_ID), name: raw.NAME, order }))
}

export function transformPipeline(raw: RawBitrix24Category, stages: RawBitrix24Stage[]): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name,
    stages: transformStages(stages),
    metadata: raw,
  }
}

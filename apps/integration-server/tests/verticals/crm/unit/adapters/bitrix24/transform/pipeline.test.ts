/**
 * Fixtures are the documented examples:
 * - funnel: crm.category.list / crm.category.get
 *   (https://apidocs.bitrix24.com/api-reference/crm/universal/category/crm-category-list.html)
 * - stages: crm.status.list rows, which crm.dealcategory.stage.list is
 *   "equivalent to" (https://apidocs.bitrix24.com/api-reference/crm/status/crm-status-list.html)
 */
import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawBitrix24Category,
  type RawBitrix24Stage,
} from '../../../../../../../src/verticals/crm/adapters/bitrix24/transform/pipeline'

const GENERAL: RawBitrix24Category = {
  id: 0,
  name: 'General',
  sort: 300,
  entityTypeId: 2,
  isDefault: 'Y',
}

const FUNNEL: RawBitrix24Category = {
  id: 9,
  name: 'Funnel with Original Name',
  sort: 200,
  entityTypeId: 2,
  isDefault: 'N',
  originId: '',
  originatorId: '',
}

function stage(STATUS_ID: string, NAME: string, SORT: string): RawBitrix24Stage {
  return {
    ID: '101',
    ENTITY_ID: 'DEAL_STAGE',
    STATUS_ID,
    NAME,
    NAME_INIT: NAME,
    SORT,
    SYSTEM: 'Y',
    CATEGORY_ID: null,
    COLOR: '#39A8EF',
    SEMANTICS: null,
    EXTRA: { SEMANTICS: 'process', COLOR: '#39A8EF' },
  }
}

const STAGES: RawBitrix24Stage[] = [
  stage('PREPARATION', 'Document preparation', '20'),
  stage('NEW', 'New', '10'),
  stage('PREPAYMENT_INVOICE', 'Prepayment invoice', '30'),
]

describe('bitrix24 transformPipeline', () => {
  it('maps the documented funnel and its stages, and parses as a Pipeline', () => {
    const out = PipelineSchema.parse(transformPipeline(FUNNEL, STAGES))
    expect(out.id).toBe('9')
    expect(out.name).toBe('Funnel with Original Name')
    expect(out.stages).toEqual([
      { id: 'NEW', name: 'New', order: 0 },
      { id: 'PREPARATION', name: 'Document preparation', order: 1 },
      { id: 'PREPAYMENT_INVOICE', name: 'Prepayment invoice', order: 2 },
    ])
  })

  it('keeps the default funnel, whose id is 0', () => {
    const out = PipelineSchema.parse(transformPipeline(GENERAL, []))
    expect(out.id).toBe('0')
    expect(out.name).toBe('General')
    expect(out.stages).toEqual([])
  })

  it('orders stages by SORT as a number, not as a string', () => {
    const out = transformPipeline(FUNNEL, [
      stage('LATE', 'Late', '100'),
      stage('EARLY', 'Early', '9'),
    ])
    expect(out.stages?.map((s) => s.id)).toEqual(['EARLY', 'LATE'])
  })

  it('preserves raw metadata by reference', () => {
    expect(transformPipeline(FUNNEL, STAGES).metadata).toBe(FUNNEL)
  })
})

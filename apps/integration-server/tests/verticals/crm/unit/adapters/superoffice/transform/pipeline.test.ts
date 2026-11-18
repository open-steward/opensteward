/**
 * Fixture built from SuperOffice.CRM.Services.SaleTypeEntity and
 * SelectableMDOListItem in openapi-v3-List.json (GET /api/v1/List/SaleType/Items):
 *   SaleTypeId "Primary key", Name "The list item", Deleted "0 -> record is active
 *   1 -> record is 'deleted'", Stages "Stages, those associated with this SaleType
 *   are selected." — items: Id, Name, Selected "True if the ListItem is selected",
 *   Deleted "The deleted status of the ListItem".
 */
import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawSuperofficeSaleType,
} from '../../../../../../../src/verticals/crm/adapters/superoffice/transform/pipeline'

const SALE_TYPE: RawSuperofficeSaleType = {
  SaleTypeId: 4,
  Name: 'Licence sale',
  Tooltip: 'New licences',
  Rank: 1,
  Deleted: false,
  Stages: [
    { Id: 1, Name: 'Lead', Selected: true, Deleted: false, Rank: 1 },
    { Id: 2, Name: 'Proposal', Selected: false, Deleted: false, Rank: 2 },
    { Id: 3, Name: 'Negotiation', Selected: true, Deleted: false, Rank: 3 },
    { Id: 9, Name: 'Retired stage', Selected: true, Deleted: true, Rank: 4 },
  ],
}

describe('superoffice transformPipeline', () => {
  it('maps a sale type to a pipeline, keeping only its selected, live stages', () => {
    const p = PipelineSchema.parse(transformPipeline(SALE_TYPE))
    expect(p.id).toBe('4')
    expect(p.name).toBe('Licence sale')
    expect(p.is_active).toBe(true)
    expect(p.stages).toEqual([
      { id: '1', name: 'Lead' },
      { id: '3', name: 'Negotiation' },
    ])
    expect(p.metadata).toEqual(SALE_TYPE)
  })

  it('reads Deleted as inactive', () => {
    expect(transformPipeline({ ...SALE_TYPE, Deleted: true }).is_active).toBe(false)
  })

  it('claims no stages when the carrier has none', () => {
    const p = PipelineSchema.parse(transformPipeline({ SaleTypeId: 5, Name: 'Service' }))
    expect(p.stages).toBeUndefined()
    expect(p.is_active).toBeUndefined()
  })

  it('throws on a sale type without an id or name', () => {
    expect(() => transformPipeline({ Name: 'x' })).toThrow(/no id/)
    expect(() => transformPipeline({ SaleTypeId: 4 })).toThrow(/no Name/)
  })
})

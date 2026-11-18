/**
 * Fixture: the "List Deal Pipelines" example response
 * (GET https://api.clientify.net/v1/deals/pipelines/,
 * https://developer.clientify.com/), first result, verbatim.
 */
import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawClientifyPipeline,
} from '../../../../../../../src/verticals/crm/adapters/clientify/transform/pipeline'

const DOCUMENTED: RawClientifyPipeline = {
  url: 'https://api.clientify.net/v1/deal-pipelines/17/',
  id: 17,
  user_company: 'felipemarin',
  name: 'Por defecto',
  stages: [
    {
      url: 'https://api.clientify.net/v1/deal-pipeline-stages/49/',
      id: 49,
      pipeline: 'https://api.clientify.net/v1/deal-pipelines/17/',
      name: 'Toma de contacto',
      position: 0,
      probability: 2,
    },
    {
      url: 'https://api.clientify.net/v1/deal-pipeline-stages/50/',
      id: 50,
      pipeline: 'https://api.clientify.net/v1/deal-pipelines/17/',
      name: 'Presentación de propuesta',
      position: 1,
      probability: 5,
    },
    {
      url: 'https://api.clientify.net/v1/deal-pipeline-stages/51/',
      id: 51,
      pipeline: 'https://api.clientify.net/v1/deal-pipelines/17/',
      name: 'En negociación',
      position: 2,
      probability: 7,
    },
  ],
  is_default: true,
  user_default: false,
}

describe('clientify transformPipeline', () => {
  it('maps the documented pipeline and parses as a canonical Pipeline', () => {
    const out = PipelineSchema.parse(transformPipeline(DOCUMENTED))
    expect(out.id).toBe('17')
    expect(out.name).toBe('Por defecto')
    expect(out.stages).toEqual([
      { id: '49', name: 'Toma de contacto', order: 0 },
      { id: '50', name: 'Presentación de propuesta', order: 1 },
      { id: '51', name: 'En negociación', order: 2 },
    ])
  })

  it('reads the stage order from the documented `position`', () => {
    const out = transformPipeline(DOCUMENTED)
    expect(out.stages?.map((s) => s.order)).toEqual([0, 1, 2])
  })

  it('does not turn the 1–10 stage probability into a percentage', () => {
    for (const s of transformPipeline(DOCUMENTED).stages ?? [])
      expect(s.win_probability).toBeUndefined()
  })

  it('gives an empty stage list when the pipeline has none', () => {
    const out = PipelineSchema.parse(transformPipeline({ id: 20, name: 'Flujo de venta 1' }))
    expect(out.stages).toEqual([])
  })

  it('preserves raw metadata by reference', () => {
    expect(transformPipeline(DOCUMENTED).metadata).toBe(DOCUMENTED)
  })
})

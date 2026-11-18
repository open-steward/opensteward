import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
} from '../../../../../../../src/verticals/crm/adapters/monday-crm/transform/pipeline'
import type { MondayBoard } from '../../../../../../../src/verticals/crm/adapters/monday-crm/client'

function makeRaw(overrides: Partial<MondayBoard> = {}): MondayBoard {
  return { id: 'b-1', name: 'Board', columns: [], ...overrides }
}

describe('monday-crm transformPipeline', () => {
  it('maps id', () => {
    expect(transformPipeline(makeRaw({ id: 'b-1' })).id).toBe('b-1')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw({ name: 'Sales Board' })).name).toBe('Sales Board')
  })

  it('extracts stages from color column settings_str', () => {
    const settings = JSON.stringify({ labels: { '0': 'New', '1': 'Qualified' } })
    const result = transformPipeline(makeRaw({
      columns: [{ id: 'status', title: 'Status', type: 'color', settings_str: settings }],
    }))
    expect(result.stages).toHaveLength(2)
    expect(result.stages?.[0].name).toBe('New')
    expect(result.stages?.[1].name).toBe('Qualified')
  })

  it('returns empty stages when no color column', () => {
    expect(transformPipeline(makeRaw()).stages).toEqual([])
  })

  it('is marked active', () => {
    expect(transformPipeline(makeRaw()).is_active).toBe(true)
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw as unknown as Record<string, unknown>)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline(makeRaw({ id: 'b-1' }))
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})

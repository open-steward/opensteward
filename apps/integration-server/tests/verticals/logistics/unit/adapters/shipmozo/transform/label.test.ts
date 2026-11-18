/**
 * Get-Order-Label API (Shipmozo API documentation PDF): "The label is
 * returned as a base64-encoded PNG image." Response fields: label "The
 * shipping label in base64-encoded PNG format", created_at "The timestamp of
 * when the label was generated (format: YYYY-MM-DD HH:MM)".
 */
import { describe, it, expect } from 'vitest'
import { transformLabel } from '../../../../../../../src/verticals/logistics/adapters/shipmozo/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'
import { docLabelRow } from '../fixtures'

describe('shipmozo transformLabel', () => {
  it('maps the documented example row and parses as a Label', () => {
    const raw = docLabelRow()
    const l = LabelSchema.parse(transformLabel('GGN9000181640', raw))
    expect(l).toEqual({
      id: 'GGN9000181640',
      trackingNumber: 'GGN9000181640',
      format: 'PNG',
      base64: 'iVBORw0KGgoAAAANSUhEUgAA...',
      metadata: raw,
    })
  })

  it('keeps a bare base64 body as is', () => {
    const l = transformLabel('A1', { ...docLabelRow(), label: 'iVBORw0K' })
    expect(l.base64).toBe('iVBORw0K')
  })

  it('never reads created_at, whose zone the docs do not give', () => {
    expect(transformLabel('A1', docLabelRow()).createdAt).toBeUndefined()
  })

  it('throws when the documented label field is missing', () => {
    expect(() => transformLabel('A1', { created_at: '2024-09-27 12:59:56' })).toThrow(/label/)
  })
})

import { describe, it, expect } from 'vitest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'
import { transformManifest } from '../../../../../../../src/verticals/logistics/adapters/inpost/transform/manifest'
import { dispatchOrder } from '../fixtures'

describe('inpost transformManifest (DispatchOrder)', () => {
  it('maps the documented DispatchOrder details example', () => {
    const m = ManifestSchema.parse(transformManifest(dispatchOrder()))
    expect(m.id).toBe('3223738')
    expect(m.carrierId).toBe('inpost')
    expect(m.manifestNumber).toBe('2003222292')
    expect(m.status).toBe('SUBMITTED')
    expect(m.shipmentIds).toEqual(['793374228'])
    expect(m.labelCount).toBeUndefined()
    expect(m.createdAt?.toISOString()).toBe('2022-05-27T08:15:31.756Z')
    expect(m.updatedAt?.toISOString()).toBe('2022-05-27T08:15:32.122Z')
  })

  it.each([
    ['new', 'OPEN'],
    ['sent', 'SUBMITTED'],
    ['accepted', 'ACCEPTED'],
    ['done', 'CLOSED'],
    ['rejected', 'unknown'],
    ['canceled', 'unknown'],
  ])('maps documented status %s to %s', (status, expected) => {
    const m = ManifestSchema.parse(transformManifest(dispatchOrder({ status })))
    expect(m.status).toBe(expected)
  })

  it('leaves manifestNumber unset while external_id is null (creation is asynchronous)', () => {
    const m = ManifestSchema.parse(transformManifest(dispatchOrder({ external_id: null })))
    expect(m.manifestNumber).toBeUndefined()
  })

  it('leaves shipmentIds unset when the list item omits shipments', () => {
    const m = ManifestSchema.parse(transformManifest({ id: 3, status: 'new' }))
    expect(m.id).toBe('3')
    expect(m.shipmentIds).toBeUndefined()
  })
})

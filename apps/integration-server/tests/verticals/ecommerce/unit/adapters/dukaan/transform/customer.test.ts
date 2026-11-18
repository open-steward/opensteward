import { describe, it, expect } from 'vitest'
import {
  transformAudienceRow,
  transformStoreLead,
  type RawDukaanAudienceRow,
  type RawDukaanStoreLead,
} from '../../../../../../../src/verticals/ecommerce/adapters/dukaan/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'
import { AUDIENCE_ROW, STORE_LEAD } from '../fixtures'

const row = () => structuredClone(AUDIENCE_ROW) as unknown as RawDukaanAudienceRow
const lead = () => structuredClone(STORE_LEAD) as unknown as RawDukaanStoreLead

describe('transformAudienceRow (documented get_store_audience_list row)', () => {
  it('parses against CustomerSchema and maps the documented fields', () => {
    const c = CustomerSchema.parse(transformAudienceRow(row()))
    expect(c.id).toBe('21881957')
    expect(c.email).toBe('neelseth48@sample.com')
    expect(c.firstName).toBe('Neel')
    expect(c.lastName).toBe('Seth')
    expect(c.phone).toBe('+91-9884002291')
    expect(c.ordersCount).toBe(2)
    // state, pin and address_line are "" in the example: only the city is set.
    expect(c.defaultAddress).toEqual({ city: 'Bangalore' })
    expect(c.createdAt).toBe('2024-02-19T05:32:39.840Z')
    expect(c.metadata).toEqual(row())
  })

  it('maps no totalSpent: orders_total_cost carries no currency', () => {
    expect(CustomerSchema.parse(transformAudienceRow(row())).totalSpent).toBeUndefined()
  })

  it('maps the address parts when they are present', () => {
    const c = CustomerSchema.parse(
      transformAudienceRow({ ...row(), state: 'Karnataka', pin: '560103', address_line: 'C-607' }),
    )
    expect(c.defaultAddress).toEqual({
      line1: 'C-607',
      city: 'Bangalore',
      region: 'Karnataka',
      postalCode: '560103',
    })
  })
})

describe('transformStoreLead (documented get_customer_details data)', () => {
  it('parses against CustomerSchema with the id the list returns', () => {
    const c = CustomerSchema.parse(transformStoreLead(lead()))
    expect(c.id).toBe('21881957')
    expect(c.id).toBe(CustomerSchema.parse(transformAudienceRow(row())).id)
    expect(c.email).toBe('neelseth48@sample.com')
    expect(c.firstName).toBe('Neel')
    expect(c.lastName).toBe('Seth')
    expect(c.phone).toBe('+91-9884002291')
    expect(c.createdAt).toBe('2024-02-19T05:32:39.840Z')
    expect(c.updatedAt).toBe('2024-02-19T05:33:11.879Z')
  })
})

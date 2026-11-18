import { describe, it, expect } from 'vitest'
import { transformOrder } from '../../../../../../../src/verticals/logistics/adapters/tookan/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'
import { docJobDetails, docRelatedTask } from '../fixtures'

describe('Tookan transformOrder', () => {
  it('maps the documented related-task example and parses as an Order', () => {
    const o = OrderSchema.parse(transformOrder(docRelatedTask()))
    expect(o.id).toBe('123456')
    expect(o.status).toBe('PENDING') // 6 = Unassigned
    expect(o.orderNumber).toBeUndefined() // "order_id": null
    expect(o.customerId).toBe('292130')
    expect(o.notes).toBe('groceries delivery')
    expect(o.originAddress).toEqual({
      street1: 'Sector 26, Chandigarh, India',
      name: '7 Eleven Store',
      phone: '+1 201555555',
    })
    expect(o.destinationAddress).toEqual({
      street1: 'Sector 26, Chandigarh, India',
      name: '7 Eleven Store',
      phone: '+1 201555555',
    })
    // creation_datetime's zone is undocumented ("job_time" in the same
    // example is local time with a Z suffix), so it is not read.
    expect(o.createdAt).toBeUndefined()
    expect(o.orderAt).toBeUndefined()
    // "0000-00-00 00:00:00" placeholders are not dates.
    expect(o.shippedAt).toBeUndefined()
    expect(o.deliveredAt).toBeUndefined()
    expect(o.updatedAt).toBeUndefined()
    expect(o.warehouseId).toBeUndefined()
  })

  it('maps the documented job-details example and parses as an Order', () => {
    const o = OrderSchema.parse(transformOrder(docJobDetails({ job_status: 2 })))
    expect(o.id).toBe('5145')
    expect(o.status).toBe('DELIVERED')
    expect(o.originAddress).toBeUndefined() // "job_pickup_address": ""
    expect(o.destinationAddress).toEqual({
      street1: '36 Pennock Crescent,Unionville,L3R,3M4 CA',
      name: 'Joey Tribianni',
      phone: '+91 99869 06722',
      email: 'Joey@yahoo.com',
    })
    // *_datetime_utc are "YYYY-MM-DD HH:MM:SS" in UTC.
    expect(o.shippedAt?.toISOString()).toBe('2017-12-06T12:29:47.000Z')
    expect(o.deliveredAt?.toISOString()).toBe('2017-12-06T12:37:16.000Z')
    expect(o.createdAt).toBeUndefined()
  })

  it('reads *_datetime_utc as UTC whatever the process time zone', () => {
    // vitest pins TZ=UTC, which would hide a local-time parse.
    const saved = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      const o = OrderSchema.parse(transformOrder(docJobDetails({ job_status: 2 })))
      expect(o.shippedAt?.toISOString()).toBe('2017-12-06T12:29:47.000Z')
      expect(o.deliveredAt?.toISOString()).toBe('2017-12-06T12:37:16.000Z')
    } finally {
      process.env.TZ = saved
    }
  })

  it('reads a "0000-00-00 00:00:00" placeholder in a *_datetime_utc field as no date', () => {
    // The documented examples carry this placeholder on the sibling
    // *_datetime fields; Date.UTC would turn it into 1899-11-30.
    const o = OrderSchema.parse(
      transformOrder(
        docJobDetails({
          job_status: 2,
          started_datetime_utc: '0000-00-00 00:00:00',
          completed_datetime_utc: '0000-00-00 00:00:00',
        }),
      ),
    )
    expect(o.shippedAt).toBeUndefined()
    expect(o.deliveredAt).toBeUndefined()
  })

  it('reads order_id as the order number when set', () => {
    const o = OrderSchema.parse(transformOrder(docRelatedTask({ order_id: 'Y-456' })))
    expect(o.orderNumber).toBe('Y-456')
  })

  it('has no delivery time unless the task succeeded', () => {
    const o = OrderSchema.parse(transformOrder(docJobDetails({ job_status: 3 })))
    expect(o.deliveredAt).toBeUndefined()
  })

  it.each([
    [0, 'PROCESSING'], // Assigned
    [1, 'SHIPPED'], // Started, agent on the way
    [2, 'DELIVERED'], // Successful
    [3, 'unknown'], // Failed
    [4, 'SHIPPED'], // InProgress/Arrived
    [6, 'PENDING'], // Unassigned
    [7, 'PROCESSING'], // Accepted/Acknowledged
    [8, 'unknown'], // Decline
    [9, 'CANCELLED'], // Cancel
    [10, 'CANCELLED'], // Deleted
    [5, 'unknown'], // not in the table
  ] as const)('job_status %i is %s', (s, want) => {
    const o = OrderSchema.parse(transformOrder(docRelatedTask({ job_status: s })))
    expect(o.status).toBe(want)
  })

  it('keeps the raw task as metadata', () => {
    const raw = docRelatedTask()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
})

/**
 * `getShipment` request/response handling. `shipmentId` is not a documented
 * `list_shipments` query param (ShipStation v1 OpenAPI — only recipientName,
 * orderNumber, orderId, carrierCode, ... — shipmentId does not appear), so a
 * platform that ignores it hands back its own [0]: an arbitrary shipment,
 * not the one requested. The adapter must verify the row it gets back is
 * actually the one asked for, not just take the head of the array.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/logistics/adapters/shipstation/client', () => ({
  ShipStationClient: class {
    get = getMock
  },
}))

import { ShipStationAdapter } from '../../../../../../src/verticals/logistics/adapters/shipstation'
import type { SSShipment } from '../../../../../../src/verticals/logistics/adapters/shipstation/transform/shipment'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'

const credentials = { accessToken: 'key:secret' } as Credentials
const adapter = new ShipStationAdapter()

function makeRawShipment(overrides: Partial<SSShipment> = {}): SSShipment {
  return {
    shipmentId: 67890,
    orderId: 12345,
    orderKey: 'key_001',
    userId: null,
    orderNumber: 'ORD-001',
    createDate: '2024-01-16T08:00:00Z',
    shipDate: '2024-01-16T08:00:00Z',
    shipmentCost: 925,
    insuranceCost: 0,
    trackingNumber: '9205590164917312751089',
    isReturnLabel: false,
    batchNumber: null,
    carrierCode: 'stamps_com',
    serviceCode: 'usps_priority_mail',
    packageCode: 'package',
    confirmation: 'delivery',
    warehouseId: 42,
    voided: false,
    voidDate: null,
    marketplaceNotified: true,
    notifyErrorMessage: null,
    shipTo: null,
    weight: null,
    dimensions: null,
    labelData: null,
    formData: null,
    ...overrides,
  }
}

describe('ShipStationAdapter.getShipment', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('requests the shipments list filtered by shipmentId', async () => {
    getMock.mockResolvedValueOnce({ shipments: [makeRawShipment({ shipmentId: 67890 })] })

    await adapter.getShipment(credentials, '67890')

    expect(getMock).toHaveBeenCalledWith('shipments', { shipmentId: '67890' })
  })

  it('returns the matching shipment and round-trips through ShipmentSchema', async () => {
    getMock.mockResolvedValueOnce({ shipments: [makeRawShipment({ shipmentId: 67890 })] })

    const result = await adapter.getShipment(credentials, '67890')

    expect(result.id).toBe('67890')
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('does not return the wrong shipment when the list has a different one first', async () => {
    // shipmentId is undocumented as a list_shipments filter, so a platform
    // that ignores it can hand back an unrelated shipment ahead of the one
    // requested — this pins that [0] is no longer trusted blindly.
    getMock.mockResolvedValueOnce({
      shipments: [makeRawShipment({ shipmentId: 11111 }), makeRawShipment({ shipmentId: 67890 })],
    })

    const result = await adapter.getShipment(credentials, '67890')

    expect(result.id).toBe('67890')
  })

  it('throws a 404 not-found error when no row in the list matches the requested id', async () => {
    getMock.mockResolvedValueOnce({ shipments: [makeRawShipment({ shipmentId: 11111 })] })

    await expect(adapter.getShipment(credentials, '67890')).rejects.toMatchObject({
      statusCode: 404,
      message: expect.stringContaining('67890'),
    })
  })

  it('throws a 404 not-found error when the list is empty', async () => {
    getMock.mockResolvedValueOnce({ shipments: [] })

    await expect(adapter.getShipment(credentials, '67890')).rejects.toMatchObject({ statusCode: 404 })
  })
})

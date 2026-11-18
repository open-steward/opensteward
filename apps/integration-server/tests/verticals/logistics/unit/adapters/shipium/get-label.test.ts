/**
 * Shipium getLabel — getLabelShortcutV1 (Shipium API OpenAPI, embedded in
 * https://docs.shipium.com/reference/ pages):
 *   GET /api/v1/deliveryexperience/shipment/carrierSelection/label/{shipiumLabelId}
 *   query includeLabelImagesInResponse (boolean, required: true)
 *   200 "Label previously generated for the shipment." → CarrierLabel
 *
 * Before this fix getLabel called GET /label/{id}, which Shipium does not document,
 * and read the label from a `carrierLabel` wrapper the documented response lacks.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ShipiumAdapter } from '../../../../../../src/verticals/logistics/adapters/shipium/index'
import { LabelSchema } from '../../../../../../src/verticals/logistics/schema/label'

afterEach(() => vi.restoreAllMocks())

describe('shipium getLabel', () => {
  it('reads the documented label path with includeLabelImagesInResponse=false', async () => {
    const get = vi.fn(async () => ({
      data: {
        shipiumShipmentId: 'shp-1',
        shipiumLabelId: 'lbl-1',
        status: 'label_created',
        labelCreationDateTime: '2024-10-30T10:50:11.123456Z',
        carrierTrackingId: '1Z999AA10123456784',
        documents: [{ labelFormat: 'pdf', labelUrl: 'https://cdn.shipium.com/lbl-1.pdf' }],
      },
      headers: {},
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const label = LabelSchema.parse(
      await new ShipiumAdapter().getLabel({ accessToken: 'k' }, 'lbl-1'),
    )
    expect(get).toHaveBeenCalledWith('/deliveryexperience/shipment/carrierSelection/label/lbl-1', {
      params: { includeLabelImagesInResponse: false },
    })
    expect(label.id).toBe('lbl-1')
    expect(label.shipmentId).toBe('shp-1')
    expect(label.trackingNumber).toBe('1Z999AA10123456784')
    expect(label.url).toBe('https://cdn.shipium.com/lbl-1.pdf')
    expect(label.createdAt?.toISOString()).toBe('2024-10-30T10:50:11.123Z')
  })
})

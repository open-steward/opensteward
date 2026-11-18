import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type EasyshipLabelResponse,
} from '../../../../../../../src/verticals/logistics/adapters/easyship/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeResponse(overrides: Partial<EasyshipLabelResponse> = {}): EasyshipLabelResponse {
  return {
    shipment: {
      easyship_shipment_id: 'ESP-1',
      label_state: 'label_generated',
      shipping_documents: [
        {
          category: 'label',
          format: 'pdf',
          url: 'https://labels.easyship.example/ESP-1.pdf',
          base64_encoded_strings: ['JVBERi0xLjQK'],
        },
        {
          category: 'commercial_invoice',
          format: 'pdf',
          url: 'https://docs.easyship.example/ESP-1-invoice.pdf',
        },
      ],
      trackings: [{ tracking_number: 'EZ123456789', courier_service_id: 'usps-priority' }],
    },
    meta: { status: 201 },
    ...overrides,
  }
}

describe('Easyship transformLabel', () => {
  it('reads the label document out of shipping_documents, not a flat label object', () => {
    const label = transformLabel(makeResponse())
    expect(label.url).toBe('https://labels.easyship.example/ESP-1.pdf')
    expect(label.base64).toBe('JVBERi0xLjQK')
    expect(label.format).toBe('PDF')
  })

  it('ignores shipping_documents entries that are not category "label"', () => {
    const label = transformLabel(
      makeResponse({
        shipment: {
          easyship_shipment_id: 'ESP-1',
          shipping_documents: [
            { category: 'commercial_invoice', format: 'pdf', url: 'https://docs.example/x.pdf' },
          ],
        },
      }),
    )
    expect(label.url).toBeUndefined()
    expect(label.base64).toBeUndefined()
    expect(label.format).toBeUndefined()
  })

  it('takes tracking number and service code from shipment.trackings', () => {
    const label = transformLabel(makeResponse())
    expect(label.trackingNumber).toBe('EZ123456789')
    expect(label.serviceCode).toBe('usps-priority')
  })

  it('uses the Easyship shipment id for both id and shipmentId — there is no separate label id', () => {
    const label = transformLabel(makeResponse())
    expect(label.id).toBe('ESP-1')
    expect(label.shipmentId).toBe('ESP-1')
  })

  it('sets carrierId to easyship and status to CREATED', () => {
    const label = transformLabel(makeResponse())
    expect(label.carrierId).toBe('easyship')
    expect(label.status).toBe('CREATED')
  })

  it('passes through the raw response as metadata', () => {
    const raw = makeResponse()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('handles a shipment with no trackings or shipping_documents yet', () => {
    const label = transformLabel({ shipment: { easyship_shipment_id: 'ESP-2' } })
    expect(label.id).toBe('ESP-2')
    expect(label.url).toBeUndefined()
    expect(label.trackingNumber).toBeUndefined()
  })

  it('round-trips through LabelSchema', () => {
    expect(() => LabelSchema.parse(transformLabel(makeResponse()))).not.toThrow()
  })
})

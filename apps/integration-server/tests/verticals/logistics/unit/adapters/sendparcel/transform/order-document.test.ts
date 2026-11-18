/**
 * Fixture: one item of the `POST /rest-api/orders/documents` 200 array from the
 * spec embedded in https://api.sendparcel.com/rest-api/doc:
 * `{file_name: "File name", ftype: "File format", file_data: "File data format: base64"}`.
 */
import { describe, it, expect } from 'vitest'
import { transformOrderDocument } from '../../../../../../../src/verticals/logistics/adapters/sendparcel/transform/order-document'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

describe('transformOrderDocument', () => {
  it('maps a documented file onto a valid Label keyed by the order id', () => {
    const label = LabelSchema.parse(
      transformOrderDocument('123456', {
        file_name: 'label_123456.pdf',
        ftype: 'pdf',
        file_data: 'JVBERi0xLjQK',
      }),
    )
    expect(label).toEqual({
      id: '123456',
      format: 'PDF',
      base64: 'JVBERi0xLjQK',
      metadata: { orderId: '123456', file_name: 'label_123456.pdf', ftype: 'pdf' },
    })
  })

  it('leaves the format unset for an ftype the spec does not name', () => {
    const label = LabelSchema.parse(
      transformOrderDocument('1', { file_name: 'x', ftype: 'zip', file_data: 'UEsDBA==' }),
    )
    expect(label.format).toBeUndefined()
    expect(label.url).toBeUndefined()
    expect(label.status).toBeUndefined()
  })
})

import { describe, it, expect } from 'vitest'
import { transformLabel } from '../../../../../../../src/verticals/logistics/adapters/ithink-logistics/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

// https://docs.ithinklogistics.com/doc-print-shipment/3, "Success Response".
const DOC = {
  status: 'success',
  status_code: 200,
  file_name:
    'http://pre-alpha.ithinklogistics.com/uploads/shipping/b04f3619fc54612329b089c073a7d812.pdf',
}

describe('ithink-logistics transformLabel (documented shipping/label.json response)', () => {
  it('parses against LabelSchema with the PDF URL', () => {
    const l = LabelSchema.parse(transformLabel(DOC, '86210010463'))
    expect(l).toMatchObject({
      id: '86210010463',
      trackingNumber: '86210010463',
      status: 'CREATED',
      format: 'PDF',
      url: DOC.file_name,
    })
  })

  it("uses the schema's lowercase 'unknown' for a non-success status", () => {
    const l = LabelSchema.parse(transformLabel({ ...DOC, status: 'error' }, '1'))
    expect(l.status).toBe('unknown')
  })

  it('omits a file_name that is not an absolute URL', () => {
    expect(transformLabel({ ...DOC, file_name: 'x.pdf' }, '1').url).toBeUndefined()
  })
})

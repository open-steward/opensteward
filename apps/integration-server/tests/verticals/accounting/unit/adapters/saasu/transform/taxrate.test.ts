/** Saasu tax code → TaxRate, over the documented GET TaxCode/{id} sample. */
import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate } from '../../../../../../../src/verticals/accounting/adapters/saasu/transform/taxrate'
import { taxCode } from '../fixtures'

describe('transformTaxRate (saasu)', () => {
  it('maps the documented fields, the fractional Rate as a percentage', () => {
    const t = TaxRateSchema.parse(transformTaxRate(taxCode()))
    expect(t).toMatchObject({
      id: '1',
      name: 'Sale Inc GST',
      description: 'some notes',
      rate: 10,
      isActive: true,
    })
    expect(t.metadata).toMatchObject({ Code: 'G1' })
  })

  it('keeps a fractional percentage without binary noise', () => {
    expect(transformTaxRate(taxCode({ Rate: 0.0875 })).rate).toBe(8.75)
  })

  it('uses the numeric Id, the key GET TaxCode/{id} takes, not the code', () => {
    expect(transformTaxRate(taxCode({ Id: 42, Code: 'G1' })).id).toBe('42')
  })
})

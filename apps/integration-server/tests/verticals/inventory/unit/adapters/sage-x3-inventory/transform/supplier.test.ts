import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawSageX3Supplier,
} from '../../../../../../../src/verticals/inventory/adapters/sage-x3-inventory/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('sage-x3-inventory transformSupplier', () => {
  const raw: RawSageX3Supplier = {
    BPSNUM: 'SUP001',
    BPSNAM: 'Keyboards Inc',
    BPSSHO: 'KBD',
    CUR: 'USD',
    ENAFLG: '2',
    PUTTIM: 14,
    WEB: 'orders@keyboards.example',
    TEL: '+14155550199',
    BPSTYP: 'LOCAL',
  }

  it('maps id from BPSNUM', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('SUP001')
  })

  it('maps name from BPSNAM (preferred over BPSSHO)', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Keyboards Inc')
  })

  it('falls back name to BPSSHO when BPSNAM absent', () => {
    const result = transformSupplier({ ...raw, BPSNAM: undefined })
    expect(result.name).toBe('KBD')
  })

  it('ENAFLG "2" → isActive true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('ENAFLG "1" → isActive false', () => {
    const result = transformSupplier({ ...raw, ENAFLG: '1' })
    expect(result.isActive).toBe(false)
  })

  it('maps defaultCurrency from CUR', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from PUTTIM', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('maps email from WEB', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@keyboards.example')
  })

  it('maps phone from TEL', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+14155550199')
  })

  it('platform is sage-x3-inventory', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('sage-x3-inventory')
  })

  it('produces output satisfying SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

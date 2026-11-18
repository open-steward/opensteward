import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type SevDeskContact,
} from '../../../../../../../src/verticals/accounting/adapters/sevdesk/transform/contact'

function makeContact(overrides: Partial<SevDeskContact> = {}): SevDeskContact {
  return {
    id: 'con-1',
    name: 'Acme GmbH',
    surename: '',
    familyname: '',
    titel: '',
    category: { id: '3', objectName: 'Category' },
    description: '',
    akademikerTitel: '',
    gender: '',
    sageImportError: false,
    customerNumber: 'C-001',
    vatNumber: 'DE123456789',
    taxType: 'default',
    defaultCashbackTime: null,
    defaultCashbackPercent: null,
    defaultTimeToPay: null,
    taxSet: null,
    birthday: null,
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id correctly', () => {
    expect(transformContact(makeContact()).id).toBe('con-1')
  })

  it('maps name correctly', () => {
    expect(transformContact(makeContact()).name).toBe('Acme GmbH')
  })

  it('maps surename to firstName', () => {
    const c = transformContact(makeContact({ surename: 'John' }))
    expect(c.firstName).toBe('John')
  })

  it('maps familyname to lastName', () => {
    const c = transformContact(makeContact({ familyname: 'Doe' }))
    expect(c.lastName).toBe('Doe')
  })

  it('maps customerNumber to identification', () => {
    expect(transformContact(makeContact()).identification).toBe('C-001')
  })

  it('maps vatNumber to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('DE123456789')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

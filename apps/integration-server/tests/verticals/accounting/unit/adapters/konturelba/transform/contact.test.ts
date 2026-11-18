import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type KonturelbaContact } from '../../../../../../../src/verticals/accounting/adapters/konturelba/transform/contact'

function makeContact(overrides: Partial<KonturelbaContact> = {}): KonturelbaContact {
  return {
    id: 'cust-10',
    name: 'ООО Тест',
    email: 'test@company.ru',
    phone: '+7 495 000-00-00',
    inn: '1234567890',
    city: 'Moscow',
    country: 'RU',
    street: 'Tverskaya 1',
    ...overrides,
  }
}

describe('transformContact (konturelba)', () => {
  it('maps id field', () => {
    expect(transformContact(makeContact()).id).toBe('cust-10')
  })

  it('maps name field', () => {
    expect(transformContact(makeContact()).name).toBe('ООО Тест')
  })

  it('maps email', () => {
    expect(transformContact(makeContact()).emails![0].email).toBe('test@company.ru')
  })

  it('maps phone', () => {
    expect(transformContact(makeContact()).telephones![0].telephone).toBe('+7 495 000-00-00')
  })

  it('maps taxNumber from inn', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('1234567890')
  })

  it('maps city', () => {
    expect(transformContact(makeContact()).billingAddress?.city).toBe('Moscow')
  })

  it('maps country', () => {
    expect(transformContact(makeContact()).billingAddress?.country).toBe('RU')
  })

  it('maps address1 from street', () => {
    expect(transformContact(makeContact()).billingAddress?.address1).toBe('Tverskaya 1')
  })

  it('metadata identity', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type SberbusinessContact } from '../../../../../../../src/verticals/accounting/adapters/sberbusiness/transform/contact'

function makeContact(overrides: Partial<SberbusinessContact> = {}): SberbusinessContact {
  return {
    clientId: 'cl-10',
    clientName: 'Test Company',
    email: 'info@test.ru',
    phone: '+7 495 000-00-00',
    inn: '1234567890',
    city: 'Moscow',
    // SberBusiness is a Russian platform; a real payload plausibly sends
    // the localised country name, not English. This platform's actual
    // locale behaviour is unconfirmed (no accessible API docs), so the
    // fixture documents the safer assumption rather than asserting a
    // resolved code — see the MoySklad adapter for the fuller reasoning.
    country: 'Россия',
    ...overrides,
  }
}

describe('transformContact (sberbusiness)', () => {
  it('maps id from clientId', () => {
    expect(transformContact(makeContact()).id).toBe('cl-10')
  })

  it('maps name from clientName', () => {
    expect(transformContact(makeContact()).name).toBe('Test Company')
  })

  it('maps email', () => {
    expect(transformContact(makeContact()).emails![0].email).toBe('info@test.ru')
  })

  it('maps taxNumber from inn', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('1234567890')
  })

  it('maps city', () => {
    expect(transformContact(makeContact()).billingAddress?.city).toBe('Moscow')
  })

  it('cannot resolve the localised (Russian) country name the platform actually sends', () => {
    // toIso3166Alpha2() has no Cyrillic keys, so this legitimately comes
    // back undefined — nullish is the honest canonical value here, not a
    // wrong guess.
    expect(transformContact(makeContact()).billingAddress?.country).toBeUndefined()
  })

  it('resolves country when the platform sends (or is faked into sending) an English name', () => {
    // toIso3166Alpha2 is still correctly wired up end-to-end; it just has
    // nothing to work with if SberBusiness's real data is Russian-localised.
    expect(transformContact(makeContact({ country: 'Russia' })).billingAddress?.country).toBe('RU')
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

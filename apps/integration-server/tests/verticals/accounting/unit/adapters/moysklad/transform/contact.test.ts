import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type MoyskladContact } from '../../../../../../../src/verticals/accounting/adapters/moysklad/transform/contact'

function makeContact(overrides: Partial<MoyskladContact> = {}): MoyskladContact {
  return {
    id: 'cust-10',
    name: 'ООО Тест',
    email: 'test@company.ru',
    phone: '+7 495 000-00-00',
    inn: '1234567890',
    // MoySklad's account-language is Russian in production; a real payload
    // sends the localised country name, not English ('Russia' is not a
    // value this platform emits — see the comment on the adapter's
    // `MoyskladContact` interface).
    legalAddress: { city: 'Moscow', country: { name: 'Россия' } },
    ...overrides,
  }
}

describe('transformContact (moysklad)', () => {
  it('maps id field', () => {
    expect(transformContact(makeContact()).id).toBe('cust-10')
  })

  it('maps name field', () => {
    expect(transformContact(makeContact()).name).toBe('ООО Тест')
  })

  it('maps email', () => {
    const result = transformContact(makeContact())
    expect(result.emails![0].email).toBe('test@company.ru')
  })

  it('maps phone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones![0].telephone).toBe('+7 495 000-00-00')
  })

  it('maps taxNumber from inn', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('1234567890')
  })

  it('maps city from legalAddress.city', () => {
    expect(transformContact(makeContact()).billingAddress?.city).toBe('Moscow')
  })

  it('cannot resolve the localised (Russian) country name the platform actually sends', () => {
    // Documents a known, real gap rather than a bug this adapter can fix on
    // its own: MoySklad returns the country name in the account's language
    // (Russian), which toIso3166Alpha2() does not map, so this legitimately
    // comes back undefined — nullish is the honest canonical value here,
    // not a wrong guess. See the comment on MoyskladContact.legalAddress
    // for the fuller picture (metadata-only field, numeric ISO code option).
    expect(transformContact(makeContact()).billingAddress?.country).toBeUndefined()
  })

  it('resolves country when the platform sends (or is faked into sending) an English name', () => {
    // toIso3166Alpha2 is still correctly wired up end-to-end; it just has
    // nothing to work with on real MoySklad data. Pinned separately so a
    // regression in the wiring itself doesn't hide behind the Russian case.
    const result = transformContact(
      makeContact({ legalAddress: { city: 'Moscow', country: { name: 'Russia' } } }),
    )
    expect(result.billingAddress?.country).toBe('RU')
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

/**
 * MX accounts as canonical payment methods.
 *
 * Fixture fields and examples are AccountResponse's, from
 * https://docs.mx.com/openapi/platform-api/v20250224.yaml
 * (components.schemas.AccountResponse): `guid`
 * ("ACT-06d7f44b-caae-0f6e-1384-01f52e75dcb1"), `user_guid`
 * ("USR-fa7537f3-48aa-a683-a02a-b18940482f54"), `account_number` ("3331261",
 * "typically be a masked or partial account number"), `institution_code`
 * ("3af3685e-05d9-7060-359f-008d0755e993", "The code identifying a financial
 * institution"), `name` ("Test account 2", "The human-readable name for the
 * resource"), `type` (enum ANY, CASH, CHECKING, ..., CREDIT_CARD, ...),
 * `created_at` ("2025-02-13T18:08:00+00:00").
 */
import { describe, it, expect } from 'vitest'
import {
  paymentMethodId,
  transformPaymentMethod,
  type RawMxAccount,
} from '../../../../../../../src/verticals/payments/adapters/mx/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

const DOCUMENTED_ACCOUNT: RawMxAccount = {
  account_number: '3331261',
  created_at: '2025-02-13T18:08:00+00:00',
  currency_code: 'USD',
  guid: 'ACT-06d7f44b-caae-0f6e-1384-01f52e75dcb1',
  institution_code: '3af3685e-05d9-7060-359f-008d0755e993',
  member_guid: 'MBR-7c6f361b-e582-15b6-60c0-358f12466b4b',
  metadata: 'some metadata',
  name: 'Test account 2',
  type: 'CHECKING',
  updated_at: '2025-02-13T18:09:00+00:00',
  user_guid: 'USR-fa7537f3-48aa-a683-a02a-b18940482f54',
}

describe('mx transformPaymentMethod', () => {
  it('maps the documented AccountResponse example', () => {
    const result = PaymentMethodSchema.parse(transformPaymentMethod(DOCUMENTED_ACCOUNT))
    expect(result.id).toBe(
      'USR-fa7537f3-48aa-a683-a02a-b18940482f54:ACT-06d7f44b-caae-0f6e-1384-01f52e75dcb1',
    )
    expect(result.externalId).toBe('ACT-06d7f44b-caae-0f6e-1384-01f52e75dcb1')
    expect(result.customerId).toBe('USR-fa7537f3-48aa-a683-a02a-b18940482f54')
    expect(result.type).toBe('bank_account')
    expect(result.gateway).toBe('mx')
    expect(result.createdAt).toBe('2025-02-13T18:08:00.000Z')
    expect(result.updatedAt).toBe('2025-02-13T18:09:00.000Z')
    expect(result.raw).toEqual(DOCUMENTED_ACCOUNT)
  })

  it('does not pass off codes, account names or partial numbers as other fields', () => {
    const result = PaymentMethodSchema.parse(transformPaymentMethod(DOCUMENTED_ACCOUNT))
    // institution_code is a code, not a brand or a bank name.
    expect(result.brand).toBeUndefined()
    expect(result.bankName).toBeUndefined()
    // name is the account's name, not its holder's.
    expect(result.holderName).toBeUndefined()
    // account_number is "masked or partial", not documented as the last four.
    expect(result.last4).toBeUndefined()
    expect(result.metadata).toEqual({})
  })

  it.each([
    ['CHECKING', 'bank_account'],
    ['SAVINGS', 'bank_account'],
    ['CREDIT_CARD', 'card'],
    ['ANY', 'other'],
    ['CASH', 'other'],
    ['CHECKING_LINE_OF_CREDIT', 'other'],
    ['LOAN', 'other'],
    ['LINE_OF_CREDIT', 'other'],
    ['INVESTMENT', 'other'],
    ['MORTGAGE', 'other'],
    ['INSURANCE', 'other'],
    ['PREPAID', 'other'],
    ['PROPERTY', 'other'],
    [null, 'unknown'],
    ['SOMETHING_NEW', 'unknown'],
  ])('maps type %s to %s', (type, expected) => {
    const result = PaymentMethodSchema.parse(
      transformPaymentMethod({ ...DOCUMENTED_ACCOUNT, type }),
    )
    expect(result.type).toBe(expected)
  })

  it('throws instead of writing an empty id when guid or user_guid is null', () => {
    expect(() => transformPaymentMethod({ ...DOCUMENTED_ACCOUNT, guid: null })).toThrow(/guid/)
    expect(() => transformPaymentMethod({ ...DOCUMENTED_ACCOUNT, user_guid: null })).toThrow(
      /user_guid/,
    )
  })

  it('builds the id getPaymentMethod reads back', () => {
    expect(paymentMethodId('USR-1', 'ACT-2')).toBe('USR-1:ACT-2')
  })
})

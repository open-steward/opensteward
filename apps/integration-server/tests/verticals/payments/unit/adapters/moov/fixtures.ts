/**
 * Moov transfer fixtures.
 *
 * CARD_PAYMENT_TRANSFER is the 200 example of "List transfers"
 * (https://docs.moov.io/api/money-movement/transfers/list/) verbatim, with one
 * change: the example's `"amount" : { "currency" : "USD" }` omits `value`, which
 * the same page documents as required ("value integer<int64> required Quantity
 * in the smallest unit of the specified currency. In USD this is cents"). The
 * example as printed is kept as DOC_EXAMPLE_WITHOUT_VALUE, so a test can show
 * the transform refuses it instead of inventing an amount.
 *
 * The other transfers are built from the field names and enums the same page
 * documents (source/destination `paymentMethodType`, `bankAccount`
 * `lastFourAccountNumber`, `card` `lastFourCardNumber`, `refundedAmount`,
 * `refunds[].refundID`, `disputes[].disputeID`, `invoiceID`, `failureReason`,
 * `metadata`, `completedOn`).
 */

export const MERCHANT = '34233b72-780c-4a0d-8b08-cbbe23k878f8'

export const DOC_EXAMPLE_WITHOUT_VALUE = {
  transferID: 'd835gf30-4b19-4850-a9b2-c0624c41ecb3',
  source: {
    paymentMethodID: '9506dbf6-4208-44c3-ad8a-e4431660e1f2',
    paymentMethodType: 'card-payment',
    account: {
      accountID: '7e4b26c2-b399-49ef-8390-50e1ea44d550',
      email: 'jules@julesjackson.com',
      displayName: 'Jules Jackson',
    },
    card: {
      cardID: 'aefd5563-93c6-413c-875e-1bd0ebfc116d',
      fingerprint: '2f5d782ceef1c3bd31ed5...',
      brand: 'Visa',
      cardType: 'credit',
      lastFourCardNumber: '2000',
      bin: '400020',
      expiration: { month: '01', year: '28' },
      holderName: 'Jules Jackson',
      billingAddress: { postalCode: '80301' },
      domesticPushToCard: 'standard',
      domesticPullFromCard: 'supported',
      cardVerification: {
        cvv: 'unavailable',
        addressLine1: 'unavailable',
        postalCode: 'unavailable',
        accountName: {
          firstName: 'unavailable',
          lastName: 'unavailable',
          middleName: 'unavailable',
          fullName: 'unavailable',
        },
      },
      issuer: 'Moov Visa Sandbox',
      issuerCountry: 'US',
      cardAccountUpdater: {},
    },
  },
  destination: {
    paymentMethodID: '3f9969cf-a1f3-4d83-8ddc-229a506651cf',
    paymentMethodType: 'moov-wallet',
    account: {
      accountID: MERCHANT,
      email: 'john@wholebodyfitness.io',
      displayName: 'Whole Body Fitness',
    },
    wallet: {
      walletID: '744b2e78-8cc8-4a6a-af42-611e3b844503',
      partnerAccountID: '65b57f28-49e9-4afb-9bf6-7e4fb6444917',
      walletType: 'general',
    },
  },
  status: 'pending',
  amount: { currency: 'USD' },
  amountDetails: {
    tip: { currency: 'USD', valueDecimal: '3.50' },
    tax: { currency: 'USD', valueDecimal: '8.25' },
  },
  description: 'Transfer from card to wallet',
  createdOn: '2025-01-21T21:32:16Z',
  moovFees: [
    {
      accountID: '7e4b26c2-b399-49ef-8390-50e1ea44d550',
      transferParty: 'source',
      totalAmount: { currency: 'USD', valueDecimal: '0.10' },
      feeIDs: ['9d957d33-1a9a-47aa-9460-fe1a90f003dd'],
    },
  ],
}

export const CARD_PAYMENT_TRANSFER = {
  ...DOC_EXAMPLE_WITHOUT_VALUE,
  amount: { currency: 'USD', value: 1204 },
}

/** A completed, partly refunded and disputed card payment with an invoice and metadata. */
export const SETTLED_CARD_PAYMENT = {
  ...CARD_PAYMENT_TRANSFER,
  transferID: 'b1a2c3d4-0000-4000-8000-000000000001',
  status: 'completed',
  completedOn: '2025-01-22T10:00:00Z',
  invoiceID: 'inv-7a1b',
  refundedAmount: { currency: 'USD', value: 204 },
  refunds: [
    {
      refundID: 'rf-1',
      createdOn: '2025-01-23T10:00:00Z',
      updatedOn: '2025-01-23T10:00:00Z',
      status: 'completed',
      amount: { currency: 'USD', value: 204 },
    },
  ],
  disputes: [
    {
      disputeID: 'dp-1',
      createdOn: '2025-01-24T10:00:00Z',
      amount: { currency: 'USD', value: 1000 },
    },
  ],
  metadata: { orderRef: 'A-100' },
}

/** A wallet → bank account payout over standard ACH. */
export const ACH_PAYOUT_TRANSFER = {
  transferID: 'c0ffee00-0000-4000-8000-000000000002',
  source: {
    paymentMethodID: 'pm-wallet-1',
    paymentMethodType: 'moov-wallet',
    account: {
      accountID: MERCHANT,
      email: 'john@wholebodyfitness.io',
      displayName: 'Whole Body Fitness',
    },
    wallet: {
      walletID: 'w-1',
      partnerAccountID: '65b57f28-49e9-4afb-9bf6-7e4fb6444917',
      walletType: 'default',
    },
  },
  destination: {
    paymentMethodID: 'pm-bank-1',
    paymentMethodType: 'ach-credit-standard',
    account: {
      accountID: 'acct-recipient-1',
      email: 'pat@example.com',
      displayName: 'Pat Recipient',
    },
    bankAccount: {
      bankAccountID: 'ba-1',
      bankAccountType: 'checking',
      bankName: 'Example Bank',
      fingerprint: 'fp-ba-1',
      holderName: 'Pat Recipient',
      holderType: 'individual',
      lastFourAccountNumber: '6789',
      routingNumber: '273976369',
      status: 'verified',
      updatedOn: '2025-01-01T00:00:00Z',
    },
  },
  status: 'completed',
  amount: { currency: 'USD', value: 50000 },
  description: 'Weekly payout',
  createdOn: '2025-02-01T12:00:00Z',
  completedOn: '2025-02-03T12:00:00Z',
  metadata: { batch: 'wk5' },
}

/** A wallet → debit card payout (push-to-card) that failed. */
export const PUSH_TO_CARD_PAYOUT = {
  transferID: 'c0ffee00-0000-4000-8000-000000000003',
  source: ACH_PAYOUT_TRANSFER.source,
  destination: {
    paymentMethodID: 'pm-card-9',
    paymentMethodType: 'push-to-card',
    account: { accountID: 'acct-recipient-2', email: 'sam@example.com', displayName: 'Sam Driver' },
    card: { cardID: 'card-9', brand: 'Visa', cardType: 'debit', lastFourCardNumber: '4242' },
  },
  status: 'failed',
  failureReason: 'destination-payment-error',
  amount: { currency: 'USD', value: 2500 },
  createdOn: '2025-02-02T12:00:00Z',
}

/** A bank → wallet funding debit: neither a charge nor a payout. */
export const ACH_FUND_TRANSFER = {
  transferID: 'c0ffee00-0000-4000-8000-000000000004',
  source: {
    paymentMethodID: 'pm-bank-2',
    paymentMethodType: 'ach-debit-fund',
    account: {
      accountID: MERCHANT,
      email: 'john@wholebodyfitness.io',
      displayName: 'Whole Body Fitness',
    },
  },
  destination: ACH_PAYOUT_TRANSFER.source,
  status: 'completed',
  amount: { currency: 'USD', value: 100000 },
  createdOn: '2025-02-03T12:00:00Z',
}

/** A wallet → wallet transfer: neither a charge nor a payout. */
export const WALLET_TO_WALLET = {
  ...ACH_FUND_TRANSFER,
  transferID: 'c0ffee00-0000-4000-8000-000000000005',
  source: ACH_PAYOUT_TRANSFER.source,
}

type Rail = 'charge' | 'payout' | 'other'

/** A minimal documented-shape transfer of the given rail, for paging walks. */
export function transferOf(id: string, rail: Rail): Record<string, unknown> {
  const base =
    rail === 'charge'
      ? CARD_PAYMENT_TRANSFER
      : rail === 'payout'
        ? ACH_PAYOUT_TRANSFER
        : WALLET_TO_WALLET
  return { ...base, transferID: id }
}

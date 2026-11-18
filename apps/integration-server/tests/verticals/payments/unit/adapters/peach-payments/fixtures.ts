/**
 * Records built from the documented GET /v3/query sample responses
 * (https://developer.peachpayments.com/docs/oppwa-integrations-reporting,
 * "Get transactions for a specified period"). Field names and value shapes
 * are the sample's; the refund reuses that shape with paymentType RF and the
 * `referencedId` a documented back-office response carries
 * (https://developer.peachpayments.com/docs/oppwa-integrations-server-to-server).
 */
export const DOC_DEBIT = {
  id: '8ac7a4a0856290ba01856ad6026c7997',
  registrationId: '8ac7a49f852afebf01852b0fb0ee36c3',
  paymentType: 'DB',
  paymentBrand: 'VISA',
  amount: '123.00',
  currency: 'GBP',
  descriptor: '6575.7964.0477 OPP_Channel',
  result: {
    avsResponse: 'N',
    cvvResponse: 'M',
    code: '000.100.110',
    description: "Request successfully processed in 'Merchant in Integrator Test Mode'",
  },
  resultDetails: {
    ExtendedDescription: 'Approved or completed successfully',
    clearingInstituteName: 'Worldpay CI',
  },
  card: { bin: '420000', last4Digits: '0000', holder: 'Pavel Aborilov' },
  customParameters: {
    StandingInstructionAPI: 'true',
    CTPE_DESCRIPTOR_TEMPLATE: '',
    FEEDZAI_DATA_FEED: 'true',
    StoredCredentialType: 'CIT_STORED',
  },
  risk: { score: '100' },
  timestamp: '2023-01-01 00:58:08.442+0000',
}

export const DOC_REFUND = {
  id: '8ac7a4a18562871c01856ad602c91aab',
  referencedId: '8ac7a4a29d21e3c1019d2621802c7bc6',
  paymentType: 'RF',
  paymentBrand: 'VISA',
  amount: '92.00',
  currency: 'EUR',
  descriptor: '8542.1130.3025 OPP_Channel',
  result: {
    code: '000.100.110',
    description: "Request successfully processed in 'Merchant in Integrator Test Mode'",
  },
  customParameters: { CTPE_DESCRIPTOR_TEMPLATE: '', FEEDZAI_DATA_FEED: 'true' },
  timestamp: '2022-11-10 12:59:49.520+0000',
}

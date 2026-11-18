/**
 * Rows of `GET /analytics/v2/transactions-list`, copied from the documented
 * example response '1' ("Get transactions list") at
 * https://api-docs.kushkipagos.com/mexico/online-payments/analytics/transactions-list-v2.md.
 */
import type { RawKushkiTransaction } from '../../../../../../src/verticals/payments/adapters/kushki/transform/shared'

/** The approved SALE of example '1'. */
export const APPROVED_SALE: RawKushkiTransaction = {
  masked_credit_card: '545195XXXXXX5480',
  created: '2025-02-04T15:55:37.000Z',
  metadata: '{"contractID":"157AB"}',
  approved_transaction_amount: 1000,
  contact_details: {
    document_code: 'DORJ760623HNGDORJ7',
    document_type: 'CURP',
    email: 'user@example.com',
    first_name: 'John',
    last_name: 'Doe',
    phone: '+52 5512345678',
  },
  country: 'Mexico',
  credential_alias: 'Alias1',
  credential_id: '22c33a81f145415cb200ab8139603a51',
  currency_code: 'MXN',
  ice_value: 0,
  iva_value: 0,
  merchant_id: '20000000106554380000',
  merchant_name: 'TW Mexico',
  payment_method: 'CARD',
  payment_submethod: 'CARD NO PRESENT',
  processor_id: '6000000000172166121420424728',
  processor_name: 'Prosa Processor',
  processor_type: 'gateway',
  public_credential_id: 'd5713887dc434cc4bb873781e46e10ca',
  request_amount: 1000,
  response_code: '000',
  response_text: 'Transacción aprobada',
  subtotal_iva: 0,
  subtotal_iva0: 1000,
  ticket_number: '029184246439606168',
  token: 'a53d40a70ead40ecb24a4c872027da5c',
  transaction_id: '700011575252919092',
  transaction_reference: 'aa778d12-c56b-4cc2-86c8-1dea7cebe65e',
  transaction_status: 'APPROVED',
  transaction_type: 'SALE',
  acquirer_bank: 'Afirme',
  approval_code: '000000',
  bin_card: '54519515',
  card_country: 'Mexico',
  card_country_code: 'MX',
  card_holder_name: 'John Doe',
  card_type: 'credit',
  foreign_card: true,
  issuing_bank: 'Banco de la Produccion ',
  last_four_digits: '5480',
  payment_brand: 'Mastercard',
  processor_merchant_id: '111',
  taxes: { agenciaDeViaje: 0, iac: 0, tasaAeroportuaria: 0 },
  transaction_card_id: '6420c5bd-5a3f-45d2-8ac4-88de7b09958d',
}

/** The declined SALE of example '1': it carries no `ticket_number`. */
export const DECLINED_SALE: RawKushkiTransaction = {
  masked_credit_card: '545195XXXXXX5480',
  created: '2025-02-04T15:53:45.000Z',
  metadata: '{"contractID":"157AB"}',
  approved_transaction_amount: 0,
  country: 'Mexico',
  currency_code: 'MXN',
  merchant_id: '20000000106554380000',
  payment_method: 'CARD',
  payment_submethod: 'CARD NO PRESENT',
  request_amount: 1000,
  response_code: 'K220',
  response_text: 'Monto de la transacción es diferente al monto de la venta inicial',
  subtotal_iva: 0,
  subtotal_iva0: 1000,
  token: '47cd356ce5724d68993218d6be4834c9',
  transaction_id: '1738684425593130452',
  transaction_reference: '1275635a-ad34-4764-a27e-f6215b94b3c7',
  transaction_status: 'DECLINED',
  transaction_type: 'SALE',
}

/**
 * The docs carry no REFUND example. This is example '1''s VOID row (which
 * names its sale in `sale_ticket_number`) with `transaction_type: REFUND`,
 * the value the `transaction_type` parameter documents.
 */
export const REFUND_ROW: RawKushkiTransaction = {
  masked_credit_card: '545195XXXXXX5480',
  created: '2025-02-04T15:58:44.302Z',
  metadata: '{"contractID":"157AB"}',
  approved_transaction_amount: 500,
  country: 'Mexico',
  currency_code: 'MXN',
  merchant_id: '20000000106554380000',
  merchant_name: 'TW Mexico',
  payment_method: 'CARD',
  request_amount: 500,
  response_code: '000',
  response_text: 'Transacción aprobada',
  sale_approval_code: '000000',
  sale_ticket_number: '029184246439606168',
  sale_transaction_type: 'SALE',
  subtotal_iva: 500,
  subtotal_iva0: 0,
  ticket_number: '661738684712571670',
  transaction_id: '700011575252919092',
  transaction_reference: '2052742c-97dc-4d8a-b7b0-27bf4eafcc0a',
  transaction_status: 'APPROVED',
  transaction_type: 'REFUND',
}

/**
 * Example '1' ("default") of GET /subscriptions/v1/card/search/{subscriptionId},
 * https://api-docs.kushkipagos.com/mexico/online-payments/one-click-payments/get-recurring-charge-info.md.
 */
export const SUBSCRIPTION = {
  amount: { subtotalIva0: 30, ice: 0, currency: 'MXN', iva: 0, subtotalIva: 0 },
  bin: '545195',
  cardHolderName: 'John Doe',
  cardType: 'CREDIT',
  contactDetails: { firstName: 'John', lastName: 'Doe', email: 'user@example.com' },
  created: 1574693127,
  lastFourDigits: '5480',
  maskedCardNumber: '545195XXXXXX5480',
  merchantId: '20000000106212540000',
  metadata: { codeUser: '1', codeCompra: 'd93d7a6' },
  paymentBrand: 'MASTERCARD',
  periodicity: 'yearly',
  planName: 'Standard',
  startDate: 1574726400,
  subscriptionId: '1574693127852000',
}

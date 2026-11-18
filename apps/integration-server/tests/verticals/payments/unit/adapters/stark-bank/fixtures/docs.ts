/**
 * Records copied from the example responses at https://docs.starkbank.com/api
 * (the Curl RESPONSE tab of each list route), with the docs' JSON typos
 * (trailing commas, unquoted datetimes) repaired.
 */

/** GET /v2/invoice → "invoices"[0] */
export const DOC_INVOICE = {
  id: '4600131349381120',
  status: 'created',
  amount: 400000,
  nominalAmount: 400000,
  fineAmount: 0,
  interestAmount: 0,
  discountAmount: 0,
  expiration: 123456789,
  discounts: [{ percentage: 5.0, due: '2021-03-12T01:50:50.264656+00:00' }],
  descriptions: [{ key: 'Arya', value: 'Not today' }],
  name: 'Arya Stark',
  taxId: '012.345.678-90',
  fee: 0,
  pdf: 'https://invoice-h.sandbox.starkbank.com/pdf/851ff545535c40ba88e24a05accb9978',
  link: 'https://invoice-h.sandbox.starkbank.com/invoicelink/851ff545535c40ba88e24a05accb9978',
  fine: 2.5,
  interest: 1.3,
  tags: ['War supply', 'Invoice #1234'],
  transactionIds: [] as string[],
  brcode:
    '00020101021226600014br.gov.bcb.pix2538invoice-h.sandbox.starkbank.com/57301741758054405204000053039865802BR5910NightKing6010Winterfell62280524invoice/573017417580544063046B79',
  created: '2020-10-26T01:50:50.264656+00:00',
  updated: '2020-10-26T01:50:50.264656+00:00',
  due: '2020-05-12T17:59:26.000000+00:00',
}

/** GET /v2/transfer → "transfers"[0] */
export const DOC_TRANSFER = {
  id: '5950134772826112',
  status: 'processing',
  amount: 1000000,
  name: 'Daenerys Targaryen Stormborn',
  rules: [{ key: 'resendingLimit', value: 5 }],
  taxId: '594.739.480-42',
  bankCode: '665',
  branchCode: '2201',
  accountNumber: '76543-8',
  accountType: 'checking',
  scheduled: '2020-08-14T11:00:00+00:00',
  tags: ['daenerys', 'invoice/1234'],
  created: '2020-04-24T17:49:10.225810+00:00',
  description: 'Daenerys Targaryen Stormborn (594.739.480-42)',
  externalId: 'my-external-id',
  updated: '2020-04-24T17:49:10.225810+00:00',
  transactionIds: ['5991715760504832'],
  fee: 200,
}

/** GET /v2/transaction → "transactions"[0] */
export const DOC_TRANSACTION = {
  id: '5185595898855424',
  description: 'A Lannister always pays his debts',
  created: '2020-04-24T17:44:49.249976+00:00',
  tags: ['lannister', 'debts'],
  source: 'self',
  amount: -10000,
  externalId: 'my_unique_id',
  receiverId: '5651751147405312',
  senderId: '5083989094170624',
  fee: 0,
  balance: 1567891,
}

/** GET /v2/invoice-pull-subscription → "subscriptions"[0] */
export const DOC_SUBSCRIPTION = {
  amount: 0,
  amountMinLimit: 5000,
  bacenId: 'RR20018183202509096amQtgYdMTf',
  brcode: '',
  created: '2025-09-09T21:34:55.854022+00:00',
  updated: '2025-09-09T21:34:55.854028+00:00',
  displayDescription: 'Dragon Travel Fare',
  referenceCode: 'contract-12345',
  due: '2025-09-11T21:34:55.157021+00:00',
  externalId: 'b7e6a2c2-8e2b-4c1a-9e2a-123456789abc',
  id: '6633844090339328',
  start: '2025-09-14T03:00:00+00:00',
  end: '2025-10-14T03:00:00+00:00',
  interval: 'month',
  data: {
    accountNumber: '9123900000',
    bankCode: '05097757',
    branchCode: '1126',
    taxId: '20.018.183/0001-80',
  },
  pullMode: 'manual',
  pullRetryLimit: 3,
  name: 'John Snow',
  taxId: '012.345.678-90',
  status: 'created',
  tags: [] as string[],
  type: 'push',
}

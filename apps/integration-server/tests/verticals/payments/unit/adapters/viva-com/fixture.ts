/**
 * One row of the documented example response of "Transactions from Data
 * Service" (Payment API spec, `data_services_retrieve_transactions_response`,
 * https://developer.viva.com/downloads/payment-api.yaml), field values as the
 * spec's `example:` entries give them. OriginalAmount, ConversionRate and
 * OriginalCurrencyCode carry no example there and are left out.
 */
import type { RawVivaComTransaction } from '../../../../../../src/verticals/payments/adapters/viva-com/transform/transaction'
import type { RawVivaComAccountTransaction } from '../../../../../../src/verticals/payments/adapters/viva-com/transform/payout'

export function documentedTransaction(
  overrides: Partial<RawVivaComTransaction> = {},
): RawVivaComTransaction {
  return {
    TransactionId: 'e4c37c00-76ad-4730-93c2-004091ae9de1',
    TransactionTypeId: 5,
    MerchantId: '21859cf1-d7af-47b7-bfad-86b4b3bcc867',
    OrderCode: 4173124907236419,
    Email: null,
    Phone: null,
    ResellerId: null,
    ResellerSourceCode: null,
    MerchantTrns: null,
    CustomerTrns: null,
    ReferenceNumber: 635297,
    InsDate: '2024-06-21T12:37:35.577+03:00',
    SourceCode: 'Default',
    FullName: null,
    CardNumber: '454793XXXXXX3518',
    AcquirerApproved: false,
    CardTypeId: 0,
    CardCountryCode: 'GR',
    CardIssuingBank: 'REVOLUT LIMITED',
    EventId: null,
    CurrencyCode: 978,
    Amount: 0.27,
    CurrentInstallment: 0,
    TotalInstallments: 0,
    ChannelId: '09913a34-c7d2-4e99-a3a7-550f2063d3b1',
    StatusId: 'F',
    OrderTags: [],
    ClearanceDate: null,
    InterchangeFee: 0.0,
    SchemeFee: 0.0,
    TotalCommission: 0.02,
    SourceTerminalId: 16236419,
    PanEntryMode: '01',
    ParentId: null,
    TipAmount: 0.0,
    BankId: 'NET_VISA',
    AuthorizationId: null,
    RetrievalReferenceNumber: '417309634081',
    OrderServiceId: 0,
    ApplicationIdentifierTerminal: 'A0000000031010',
    MerchantIsvFeeAmount: 0.009728,
    ...overrides,
  }
}

/**
 * The documented example response of "Account Transactions"
 * (`POST /dataservices/v2/accounttransactions/Search`, definition
 * `account_transactions_200` in https://developer.viva.com/downloads/payment-api.yaml),
 * values exactly as the spec's example gives them.
 */
export function documentedAccountTransaction(
  overrides: Partial<RawVivaComAccountTransaction> = {},
): RawVivaComAccountTransaction {
  return {
    accountTransactionId: '2353af54-b897-4ac3-93b0-f374ab643572',
    created: '2023-06-06T14:21:09.487+03:00',
    personId: '201ae961-9515-4ea4-93e4-5faf7c6a1211',
    walletId: 211878332234,
    typeId: 20,
    subTypeId: 13,
    amount: 5.2,
    currencyCode: 978,
    targetAmount: 14.8,
    targetAvailable: 14.8,
    valueDate: null,
    isAuthorization: false,
    counterPart: null,
    userDescription: null,
    tag: null,
    ...overrides,
  }
}

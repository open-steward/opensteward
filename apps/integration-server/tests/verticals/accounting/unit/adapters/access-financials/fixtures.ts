/**
 * Fixtures for the Access Financials tests. Field names are the ones the
 * vendor's documented queries select; each builder's provenance is in the
 * transform test that exercises it.
 *
 * Values: salesHeader, salesOrderHeader and purchaseOrderHeader take theirs
 * from the vendor's example responses. purchaseHeader, recordDetails and
 * nominalLine are partly ARBITRARY test inputs (for example 'PI-4120',
 * 'Jane Doe', nominalCode '7100' beside nominalPrimaryKey 310): the record
 * pages show no response example, and the values are chosen to differ from
 * each other (date vs dueDate, nominalCode vs nominalPrimaryKey) so that a
 * transform reading the wrong field fails a test. The adapter never emits
 * any of them as a constant.
 */
import type { AFSalesHeader } from '../../../../../../src/verticals/accounting/adapters/access-financials/transform/invoice'
import type { AFPurchaseHeader } from '../../../../../../src/verticals/accounting/adapters/access-financials/transform/bill'
import type { AFRecordDetails } from '../../../../../../src/verticals/accounting/adapters/access-financials/transform/contact'
import type { AFNominalLine } from '../../../../../../src/verticals/accounting/adapters/access-financials/transform/journal'
import type { AFSalesOrderHeader } from '../../../../../../src/verticals/accounting/adapters/access-financials/transform/salesorder'
import type { AFPurchaseOrderHeader } from '../../../../../../src/verticals/accounting/adapters/access-financials/transform/purchaseorder'

export function salesHeader(overrides: Partial<AFSalesHeader> = {}): AFSalesHeader {
  return {
    auditNo: 158658,
    headerRef: '90052',
    accountCode: 'GB-12672',
    accountName: 'Example Customer',
    customerRef: '',
    transactionType: 'Invoice',
    transactionDescription: '',
    transactionDate: '2024-04-29',
    dueDate: '2024-04-29',
    batched: false,
    net: 100,
    tax: 0,
    gross: 100,
    outstanding: 100,
    currencySymbol: 'GBP',
    currencyNet: 0,
    currencyTax: 0,
    currencyGross: 0,
    currencyOutstanding: 0,
    ...overrides,
  }
}

export function purchaseHeader(overrides: Partial<AFPurchaseHeader> = {}): AFPurchaseHeader {
  return {
    auditNo: 4120,
    headerRef: 'PI-4120',
    accountCode: 'GB-S-1225',
    accountName: 'Hendrerit Industries',
    transactionType: 'Invoice',
    description: 'May stationery',
    date: '2023-05-17',
    dueDate: '2023-06-16',
    batched: false,
    net: 887.7,
    tax: 177.54,
    gross: 1065.24,
    outstanding: 1065.24,
    currencySymbol: 'GBP',
    currencyNet: 0,
    currencyTax: 0,
    currencyGross: 0,
    currencyOutstanding: 0,
    ...overrides,
  }
}

export function recordDetails(overrides: Partial<AFRecordDetails> = {}): AFRecordDetails {
  return {
    primaryKey: 12686,
    code: 'GB-12686',
    name: 'In At Pede Industries',
    onStop: false,
    contactDetails: { title: 'Ms', firstName: 'Jane', surname: 'Doe', jobTitle: 'Buyer' },
    addressDetails: {
      address: '1 High Street',
      town: 'Derby',
      county: 'Derbyshire',
      country: 'United Kingdom',
      postCode: 'DE1 1AA',
      email: 'accounts@inatpede.example',
      telephone: '01332 000000',
      mobile: '07700 900000',
    },
    ...overrides,
  }
}

export function nominalLine(overrides: Partial<AFNominalLine> = {}): AFNominalLine {
  return {
    primaryKey: '44985',
    auditNo: 64,
    headerRef: '28',
    date: '2024-03-31',
    detail: 'Accrued rent',
    description: 'March accruals',
    journalType: 'Journal',
    nominalCode: '7100',
    nominalPrimaryKey: 310,
    debit: 23149.92,
    credit: 0,
    currencySymbol: 'EUR',
    currencyDebit: 28543.85,
    currencyCredit: 0,
    batched: false,
    ...overrides,
  }
}

export function salesOrderHeader(overrides: Partial<AFSalesOrderHeader> = {}): AFSalesOrderHeader {
  return {
    orderNumber: 3000,
    orderType: 'Order',
    orderStatus: 'Complete',
    accountCode: 'GB-12686',
    accountName: 'In At Pede Industries',
    customerRef: '',
    orderDate: '2023-05-10',
    requiredDate: '2023-05-15',
    orderGross: 408,
    netOutstanding: 0,
    currencyGross: 0,
    currencyNetOutstanding: 0,
    currencySymbol: 'GBP',
    ...overrides,
  }
}

export function purchaseOrderHeader(
  overrides: Partial<AFPurchaseOrderHeader> = {},
): AFPurchaseOrderHeader {
  return {
    orderNumber: '5000',
    orderType: 'Order',
    orderStatus: 'Outstanding',
    accountCode: 'GB-S-1225',
    accountName: 'Hendrerit Industries',
    orderDate: '2023-05-17',
    requiredDate: '2023-05-22',
    orderGross: 1065.24,
    netOutstanding: 887.7,
    currencyGross: 0,
    currencyNetOutstanding: 0,
    currencySymbol: 'GBP',
    ...overrides,
  }
}

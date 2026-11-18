/**
 * Saasu fixtures copied from the documented JSON samples (fetched 2026-09-29):
 *   - invoice summary / detail: https://api.saasu.com/Help/Api/GET-Invoices,
 *     https://api.saasu.com/Help/Api/GET-Invoice-id-optionalargs
 *   - contact:      https://api.saasu.com/Help/Api/GET-Contacts
 *   - account:      https://api.saasu.com/Help/Api/GET-Accounts
 *   - journal:      https://api.saasu.com/Help/Api/GET-Journals,
 *                   https://api.saasu.com/Help/Api/GET-Journal-id-optionalargs
 *   - tax code:     https://api.saasu.com/Help/Api/GET-TaxCode-id
 *   - file identity https://api.saasu.com/Help/Api/GET-FileIdentity
 * The samples' AmountOwed (11.5 on a 10.45 invoice) is internally
 * inconsistent; it is kept as documented, since the transform reports what
 * Saasu sends.
 */
import type {
  SaasuInvoiceDetail,
  SaasuInvoiceSummary,
} from '../../../../../../src/verticals/accounting/adapters/saasu/invoice-shapes'
import type { SaasuContact } from '../../../../../../src/verticals/accounting/adapters/saasu/transform/contact'
import type { SaasuAccount } from '../../../../../../src/verticals/accounting/adapters/saasu/transform/account'
import type { SaasuJournal } from '../../../../../../src/verticals/accounting/adapters/saasu/transform/journal'
import type { SaasuTaxCode } from '../../../../../../src/verticals/accounting/adapters/saasu/transform/taxrate'
import type { SaasuFileIdentity } from '../../../../../../src/verticals/accounting/adapters/saasu/transform/organization'

export function invoiceSummary(overrides: Partial<SaasuInvoiceSummary> = {}): SaasuInvoiceSummary {
  return {
    TransactionId: 5093684,
    LastUpdatedId: 'AAAAAAAKgc=',
    Currency: 'AUD',
    InvoiceNumber: 'INV-1123',
    InvoiceType: 'Tax Invoice',
    TransactionType: 'S',
    Layout: 'I',
    BrandId: null,
    Summary: 'Invoice for order 1123',
    TotalAmount: 10.45,
    TotalTaxAmount: null,
    IsTaxInc: true,
    AmountPaid: 0.0,
    AmountOwed: 11.5,
    FxRate: 1.0,
    AutoPopulateFxRate: false,
    RequiresFollowUp: false,
    SentToContact: true,
    TransactionDate: '2015-01-24T00:00:00',
    BillingContactId: 1568986,
    BillingContactFirstName: 'Freddy',
    BillingContactLastName: 'Fungus',
    BillingContactOrganisationName: 'Fungal Innovation',
    ShippingContactId: 10,
    CreatedDateUtc: '2026-09-27T19:00:10.3057857Z',
    LastModifiedDateUtc: '2026-09-28T19:00:10.3057857Z',
    PaymentStatus: 'U',
    DueDate: null,
    InvoiceStatus: 'I',
    PurchaseOrderNumber: 'PO-4456',
    PaymentCount: 0,
    Tags: ['Note', 'Supplier', 'Toys'],
    ...overrides,
  }
}

export function invoiceDetail(overrides: Partial<SaasuInvoiceDetail> = {}): SaasuInvoiceDetail {
  return {
    LineItems: [
      {
        Id: 30,
        Description: 'Sale Item',
        AccountId: null,
        TaxCode: 'G1',
        TotalAmount: 10.45,
        Quantity: 3.0,
        UnitPrice: 11.5,
        PercentageDiscount: 0.0,
        InventoryId: 30,
        ItemCode: 'CC123',
        Location: null,
        Tags: [],
        Attributes: [],
      },
    ],
    NotesInternal: null,
    NotesExternal: null,
    ...invoiceSummary(),
    ...overrides,
  }
}

export function contact(overrides: Partial<SaasuContact> = {}): SaasuContact {
  return {
    Id: 896421,
    CreatedDateUtc: '2026-09-27T19:00:11.3475848Z',
    LastModifiedDateUtc: '2026-09-28T19:00:11.3475848Z',
    LastUpdatedId: 'AAAAAFwWAN8=',
    Salutation: 'Mrs.',
    GivenName: 'Mary',
    MiddleInitials: null,
    FamilyName: 'Biggs',
    IsActive: true,
    CompanyId: 3,
    PositionTitle: 'Cleaner',
    WebsiteUrl: null,
    PrimaryPhone: '02 5555 4444',
    HomePhone: null,
    OtherPhone: null,
    MobilePhone: '04 1111 1111',
    Fax: '02 5555 4445',
    EmailAddress: 'mary@example.com',
    ContactId: '4567',
    IsPartner: false,
    IsCustomer: true,
    IsSupplier: false,
    IsContractor: false,
    Tags: ['Toys', 'Business'],
    PostalAddress: {
      Street: '456 Arndale Street',
      City: 'Sydney',
      State: 'NSW',
      Postcode: '2000',
      Country: 'Australia',
    },
    OtherAddress: {
      Street: '123 whatever Street',
      City: 'Melbourne',
      State: 'VIC',
      Postcode: '3000',
      Country: 'Australia',
    },
    ...overrides,
  }
}

export function account(overrides: Partial<SaasuAccount> = {}): SaasuAccount {
  return {
    Id: 1,
    Name: 'Test Income Account',
    AccountLevel: 'Detail',
    AccountType: 'Income',
    IsActive: true,
    IsBuiltIn: false,
    LastUpdatedId: 'AAAAAAA',
    DefaultTaxCode: 'G1',
    LedgerCode: 'AA',
    Currency: 'AUD',
    HeaderAccountId: 3,
    ExchangeAccountId: 3,
    IsBankAccount: false,
    CreatedDateUtc: '2026-03-28T19:00:10.4483337Z',
    LastModifiedDateUtc: '2026-09-22T19:00:10.4483337Z',
    ...overrides,
  }
}

export function journalSummary(overrides: Partial<SaasuJournal> = {}): SaasuJournal {
  return {
    TransactionId: 5093684,
    LastUpdatedId: 'AAAAAAAKgc=',
    TransactionDate: '2015-01-24T00:00:00',
    Summary: 'Test Journal entry 1',
    Currency: 'AUD',
    FxRate: 1.0,
    AutoPopulateFxRate: false,
    Reference: '123',
    JournalContactId: 987,
    RequiresFollowUp: false,
    Tags: ['Note', 'Supplier', 'Toys'],
    CreatedDateUtc: '2026-09-27T19:00:10.4799401Z',
    LastModifiedDateUtc: '2026-09-28T19:00:10.4799401Z',
    ...overrides,
  }
}

export function journalDetail(overrides: Partial<SaasuJournal> = {}): SaasuJournal {
  return {
    Items: [{ Type: 'Credit', AccountId: 321, TaxCode: 'G1', Amount: 10.0 }],
    Notes: 'Test journal note',
    ...journalSummary(),
    ...overrides,
  }
}

export function taxCode(overrides: Partial<SaasuTaxCode> = {}): SaasuTaxCode {
  return {
    Notes: 'some notes',
    Id: 1,
    Code: 'G1',
    Name: 'Sale Inc GST',
    Rate: 0.1,
    PostingAccountId: 123,
    IsSale: true,
    IsPurchase: false,
    IsPayroll: true,
    IsInbuilt: false,
    IsShared: true,
    IsActive: true,
    CreatedDateUtc: '2025-09-28T19:00:11.3740938Z',
    LastModifiedDateUtc: '2026-09-27T19:00:11.3740938Z',
    LastModifiedByUserId: 123,
    LastUpdatedId: 'AAAAAAkh==',
    ...overrides,
  }
}

export function fileIdentity(overrides: Partial<SaasuFileIdentity> = {}): SaasuFileIdentity {
  return {
    CreatedDateUtc: null,
    LastUpdatedId: null,
    LastModifiedDateUtc: null,
    LastModifiedByUserId: null,
    Name: 'Test File',
    FullLegalName: 'Some Legal Name',
    TradingNameOrAlternativeBrandName: 'Trading test file',
    IndustryTypeId: null,
    BusinessIdentifier: '53004085616',
    BusinessIdentifierBranchNumber: null,
    CompanyIdentifier: ' 007249989',
    PrimaryPhone: '0290125555',
    Fax: null,
    Website: 'http://somehost.com',
    Email: 'file@example.com',
    Street: '1 brown st',
    City: 'Sydney',
    State: 'NSW',
    PostCode: '2000',
    Country: 'Australia',
    Zone: 'Autralia',
    CurrencyCode: null,
    IsTaxRegistered: false,
    TaxRegistrationDate: null,
    FinancialYearEndMonth: 0,
    FinancialYearEndDate: 0,
    ...overrides,
  }
}

/**
 * Response bodies copied verbatim from Bokio's Company API reference (each
 * page embeds its OpenAPI document; fetched 2026-09-29). Every fixture names
 * the page and example it came from. Tests build on these rather than on
 * invented shapes, so a transform is only ever asserted against what Bokio
 * documents.
 */

/** https://docs.bokio.se/reference/get-invoices-invoiceid.md (example "Invoice response") */
export const INVOICE = {
  id: 'a419cf69-db6f-4de9-992c-b1a60942a443',
  type: 'invoice',
  customerRef: {
    id: '55c899c5-82b2-47fa-9c51-e35fc9b26443',
    name: 'customer 1',
    customerNumber: 'CUST-001',
  },
  contactDetailRef: {
    id: 'd3b07384-d9a0-4c9b-8b3a-6e1f2a5c8d4e',
    email: 'contact@customer1.com',
    phone: '+46701234567',
  },
  invoiceNumber: '1234',
  paymentReference: null,
  orderNumberReference: 'ORD-5678',
  projectReference: 'PROJ-001',
  buyerReference: 'BUYER-123',
  contractReference: 'CONTRACT-456',
  currency: 'SEK',
  currencyRate: 1,
  totalAmount: 10000,
  totalTax: 2500,
  paidAmount: 0,
  status: 'draft',
  invoiceDate: '2024-10-10',
  dueDate: '2024-10-10',
  lineItems: [
    {
      id: 1,
      itemRef: {
        id: '55c899c5-82b2-47fa-9c51-e35fc9b26443',
        description: 'Product 1',
      },
      description: 'Product 1',
      itemType: 'salesItem',
      productType: 'goods',
      unitType: 'piece',
      quantity: 1,
      unitPrice: 5000,
      taxRate: 25,
    },
    {
      id: 2,
      description: 'Installation work',
      itemType: 'salesItem',
      productType: 'services',
      unitType: 'hour',
      quantity: 10,
      unitPrice: 500,
      taxRate: 25,
      projectRef: {
        id: '4f8f6da6-4cbc-4bfc-8d23-67d5f6f2dd9b',
        projectName: 'Website Redesign',
        projectNumber: 'P-001',
      },
      costCenterRef: {
        tagId: '7e5ee25f-1f5d-4e47-a26f-5d2d20fbef90',
        tagName: 'Nord',
      },
      taxReduction: {
        taxReductionType: 'rot',
        jobType: 'rotConstruction',
      },
    },
    {
      id: 3,
      itemRef: {
        id: 'e964435e-50ef-4524-a439-05ff87794952',
        description: 'A description line',
      },
      description: 'A description line',
      itemType: 'descriptionOnlyItem',
    },
  ],
  billingAddress: {
    line1: 'Älvsborgsvägen 10',
    line2: null,
    city: 'Göteborg',
    postalCode: '123 45',
    country: 'SE',
  },
  deliveryAddress: {
    line1: 'Delivery Street 15',
    line2: 'Floor 2',
    city: 'Stockholm',
    postalCode: '111 11',
    country: 'SE',
  },
  taxReduction: {
    type: 'rot',
    description: 'Bathroom renovation',
    propertyType: 'realEstate',
    realEstateNumber: 'STOCKHOLM SÖDER 1:2',
    deductionAmount: 1500,
    status: 'draft',
    deductionPeople: [
      {
        personalNumber: '19850101-1234',
        deductionAmount: 1500,
      },
    ],
  },
  attachmentRefs: [
    {
      id: '240a4af0-edfd-47b1-b4ab-f30450eaac19',
      fileName: 'myfile.pdf',
    },
    {
      id: '94a8f806-8493-40f6-9d5b-0495c84f8ab9',
      fileName: 'myfile2.pdf',
    },
  ],
  journalEntryRef: {
    id: 'f329df79-eb7f-5ef0-a8dc-c2b71f953554',
  },
  metadata: {
    project: 'Website Redesign',
    department: 'IT',
    externalId: 'EXT-INV-2024-001',
  },
}

/** https://docs.bokio.se/reference/get-invoices-invoiceid.md (example "Invoice with discount") */
export const INVOICE_WITH_DISCOUNT = {
  id: 'a419cf69-db6f-4de9-992c-b1a60942a443',
  type: 'invoice',
  customerRef: {
    id: '55c899c5-82b2-47fa-9c51-e35fc9b26443',
    name: 'customer 1',
    customerNumber: 'CUST-001',
  },
  contactDetailRef: {
    id: 'd3b07384-d9a0-4c9b-8b3a-6e1f2a5c8d4e',
    email: 'contact@customer1.com',
    phone: '+46701234567',
  },
  invoiceNumber: '1234',
  paymentReference: null,
  orderNumberReference: 'ORD-5678',
  projectReference: 'PROJ-001',
  buyerReference: 'BUYER-123',
  contractReference: 'CONTRACT-456',
  currency: 'SEK',
  currencyRate: 1,
  totalAmount: 11250,
  totalTax: 2250,
  paidAmount: 0,
  status: 'draft',
  invoiceDate: '2024-10-10',
  dueDate: '2024-10-10',
  lineItems: [
    {
      id: 1,
      itemRef: {
        id: '55c899c5-82b2-47fa-9c51-e35fc9b26443',
      },
      description: 'Product 1',
      itemType: 'salesItem',
      productType: 'goods',
      unitType: 'piece',
      quantity: 1,
      unitPrice: 5000,
      taxRate: 25,
      discount: {
        type: 'amount',
        value: 1000,
      },
    },
    {
      id: 2,
      description: 'Installation work',
      itemType: 'salesItem',
      productType: 'services',
      unitType: 'hour',
      quantity: 10,
      unitPrice: 500,
      taxRate: 25,
      projectRef: {
        id: '4f8f6da6-4cbc-4bfc-8d23-67d5f6f2dd9b',
        projectName: 'Website Redesign',
        projectNumber: 'P-001',
      },
      costCenterRef: {
        tagId: '7e5ee25f-1f5d-4e47-a26f-5d2d20fbef90',
        tagName: 'Nord',
      },
    },
    {
      id: 3,
      description: 'A description line',
      itemType: 'descriptionOnlyItem',
    },
  ],
  billingAddress: {
    line1: 'Älvsborgsvägen 10',
    line2: null,
    city: 'Göteborg',
    postalCode: '123 45',
    country: 'SE',
  },
  deliveryAddress: {
    line1: 'Delivery Street 15',
    line2: 'Floor 2',
    city: 'Stockholm',
    postalCode: '111 11',
    country: 'SE',
  },
  attachmentRefs: [
    {
      id: '240a4af0-edfd-47b1-b4ab-f30450eaac19',
      fileName: 'myfile.pdf',
    },
    {
      id: '94a8f806-8493-40f6-9d5b-0495c84f8ab9',
      fileName: 'myfile2.pdf',
    },
  ],
  journalEntryRef: {
    id: 'e7f8a972-5a21-411b-aed2-f224d1b6fd68',
  },
  metadata: {
    project: 'Website Redesign',
    department: 'IT',
    externalId: 'EXT-INV-2024-001',
  },
}

/** https://docs.bokio.se/reference/get-customers-customerid.md (customer schema example) */
export const CUSTOMER = {
  id: '55c899c5-82b2-47fa-9c51-e35fc9b26443',
  name: 'customer 1',
  customerNumber: 'CUST-001',
  type: 'company',
  vatNumber: 'SE1234567890',
  orgNumber: '123456-7890',
  paymentTerms: '30',
  contactsDetails: [
    {
      name: 'John Doe',
      email: 'john@email.com',
      phone: '0927-5631505',
      isDefault: true,
    },
  ],
  address: {
    line1: 'Älvsborgsvägen 10',
    line2: null,
    city: 'Göteborg',
    postalCode: '123 45',
    country: 'SE',
  },
  language: 'sv',
  modifiedDateTime: '2024-10-10T00:00:00Z',
}

/** https://docs.bokio.se/reference/get-journalentries-journalid.md (journalEntry schema example) */
export const JOURNAL_ENTRY = {
  id: 'a419cf69-db6f-4de9-992c-b1a60942a443',
  title: 'invoice 1234',
  journalEntryNumber: 'V342',
  date: '2024-10-10',
  items: [
    {
      id: 1,
      debit: 200,
      credit: 0,
      account: 1930,
      tags: [],
    },
    {
      id: 2,
      debit: 0,
      credit: 40,
      account: 3011,
      tags: [],
    },
    {
      id: 3,
      debit: 0,
      credit: 160,
      account: 2611,
      tags: [],
    },
  ],
  tags: [],
}

/** https://docs.bokio.se/reference/get-credit-note-v1.md (creditNote schema example) */
export const CREDIT_NOTE = {
  id: 'b529df79-eb7f-5ef0-a8dc-c2b71f953554',
  status: 'published',
  invoiceNumber: 'CN-2024-001',
  invoiceRef: {
    id: 'a419cf69-db6f-4de9-992c-b1a60942a443',
    invoiceNumber: 'IN-2024-001',
  },
  customerRef: {
    id: '55c899c5-82b2-47fa-9c51-e35fc9b26443',
    name: 'customer 1',
    customerNumber: 'CUST-001',
  },
  contactDetailRef: {
    id: 'd3b07384-d9a0-4c9b-8b3a-6e1f2a5c8d4e',
    email: 'contact@customer1.com',
    phone: '+46701234567',
  },
  currency: 'SEK',
  currencyRate: 1,
  totalAmount: 6375,
  totalTax: 1275,
  paidAmount: 0,
  creditDate: '2024-10-15',
  dueDate: '2024-11-15',
  publishedDateTime: '2024-10-15T12:00:00',
  projectReference: 'PROJ-001',
  buyerReference: 'BUYER-123',
  contractReference: 'CONTRACT-456',
  lineItems: [
    {
      id: 1,
      itemRef: {
        id: '55c899c5-82b2-47fa-9c51-e35fc9b26443',
        description: 'Product 1',
      },
      description: 'Product 1',
      itemType: 'salesItem',
      productType: 'goods',
      quantity: 2,
      unitPrice: 100,
      taxRate: 25,
      discount: {
        type: 'amount',
        value: 100,
      },
    },
    {
      id: 2,
      description: 'Installation work',
      itemType: 'salesItem',
      productType: 'services',
      unitType: 'hour',
      quantity: 10,
      unitPrice: 500,
      taxRate: 25,
    },
  ],
  billingAddress: {
    line1: 'Älvsborgsvägen 10',
    line2: null,
    city: 'Göteborg',
    postalCode: '123 45',
    country: 'SE',
  },
  deliveryAddress: {
    line1: 'Delivery Street 15',
    line2: 'Floor 2',
    city: 'Stockholm',
    postalCode: '111 11',
    country: 'SE',
  },
  attachmentRefs: [
    {
      id: '240a4af0-edfd-47b1-b4ab-f30450eaac19',
      fileName: 'myfile.pdf',
    },
    {
      id: '94a8f806-8493-40f6-9d5b-0495c84f8ab9',
      fileName: 'myfile2.pdf',
    },
  ],
  journalEntryRef: {
    id: '340a4af0-edfd-47b1-b4ab-f30450eaac19',
  },
  metadata: {
    project: 'Website Redesign',
    department: 'IT',
    externalId: 'EXT-INV-2024-001',
  },
}

/** https://docs.bokio.se/reference/get-chart-of-accounts.md (example "Chart of accounts") */
export const CHART_OF_ACCOUNTS = [
  {
    account: 1930,
    name: 'Företagskonto / Affärskonto',
    accountType: 'basePlanAccount',
  },
  {
    account: 3001,
    name: 'Försäljning varor, 25% moms',
    accountType: 'basePlanAccount',
  },
  {
    account: 8001,
    name: 'Custom Account',
    accountType: 'customAccount',
  },
]

/** https://docs.bokio.se/reference/get-account-with-number.md (example "Account") */
export const ACCOUNT_WITH_DETAILS = {
  account: 1930,
  name: 'Företagskonto / Affärskonto',
  accountType: 'basePlanAccount',
  accountBalance: 15000.75,
}

/** https://docs.bokio.se/reference/get-company-information-with-id.md (companyInformation schema example) */
export const COMPANY_INFORMATION = {
  id: '9b408943-7a1e-47ac-85a7-ac52b2c210d3',
  companyType: 'limitedCompany',
  name: 'Company AB',
  organizationNumber: '556677-8899',
  phone: '+46123456789',
  email: 'info@example.com',
  hasBBA: true,
  address: {
    line1: 'Älvsborgsvägen 10',
    line2: null,
    city: 'Göteborg',
    postalCode: '123 45',
    country: 'SE',
  },
}

/** https://docs.bokio.se/reference/get-supplier-invoice-by-id.md (example "Supplier invoice example") */
export const SUPPLIER_INVOICE = {
  id: '6f6b2f17-3c4a-4a69-9f2d-3f5d7e1b8c90',
  supplierRef: {
    id: '6f6b2f17-3c4a-4a69-9f2d-3f5d7e1b8c90',
    name: 'Supplier AB',
  },
  invoiceNumber: 'INV-001',
  invoiceDate: '2023-10-01',
  dueDate: '2023-10-15',
  totalAmount: 1000,
  remainingAmount: 1000,
  currency: 'SEK',
  currencyRate: 1,
  journalEntryRef: {
    id: '2d8ce6b4-1f3a-46a5-8a9d-5b7f2c4e9d10',
  },
  lineItems: [
    {
      id: 'a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
      description: 'Consulting',
      quantity: 10,
      unitPrice: 100,
      unitType: 'hour',
      taxRate: 25,
      projectRef: {
        id: '4f8f6da6-4cbc-4bfc-8d23-67d5f6f2dd9b',
        projectName: 'Website Redesign',
        projectNumber: 'P-001',
      },
      costCenterRef: {
        tagId: '7e5ee25f-1f5d-4e47-a26f-5d2d20fbef90',
        tagName: 'Nord',
      },
    },
  ],
  uploadRefs: [
    {
      id: '24f3b7c1-8d6a-4e2f-9b31-5d7c2a8e4f90',
    },
  ],
}

/** https://docs.bokio.se/reference/get-supplier-invoices.md (example "Supplier invoices") */
export const SUPPLIER_INVOICES_PAGE = {
  totalItems: 2,
  totalPages: 1,
  currentPage: 1,
  items: [
    {
      id: '6f6b2f17-3c4a-4a69-9f2d-3f5d7e1b8c90',
      supplierRef: {
        id: '6f6b2f17-3c4a-4a69-9f2d-3f5d7e1b8c90',
        name: 'Supplier AB',
      },
      invoiceNumber: 'INV-001',
      invoiceDate: '2023-10-01',
      dueDate: '2023-10-15',
      totalAmount: 1000,
      remainingAmount: 1000,
      currency: 'SEK',
      currencyRate: 1,
      journalEntryRef: {
        id: '2d8ce6b4-1f3a-46a5-8a9d-5b7f2c4e9d10',
      },
      lineItems: [
        {
          id: 'a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
          description: 'Consulting',
          quantity: 10,
          unitPrice: 100,
          unitType: 'hour',
          taxRate: 25,
          projectRef: {
            id: '4f8f6da6-4cbc-4bfc-8d23-67d5f6f2dd9b',
            projectName: 'Website Redesign',
            projectNumber: 'P-001',
          },
          costCenterRef: {
            tagId: '7e5ee25f-1f5d-4e47-a26f-5d2d20fbef90',
            tagName: 'Nord',
          },
        },
      ],
      uploadRefs: [
        {
          id: '24f3b7c1-8d6a-4e2f-9b31-5d7c2a8e4f90',
        },
      ],
    },
    {
      id: '2d8ce6b4-1f3a-46a5-8a9d-5b7f2c4e9d10',
      supplierRef: {
        id: '2d8ce6b4-1f3a-46a5-8a9d-5b7f2c4e9d10',
        name: 'Consulting Nordic AB',
      },
      invoiceNumber: 'INV-002',
      invoiceDate: '2023-10-05',
      dueDate: '2023-10-20',
      totalAmount: 2500,
      remainingAmount: 500,
      currency: 'SEK',
      currencyRate: 1,
      journalEntryRef: {
        id: '3c1a5e7b-9d2f-4b86-ae31-7f4c2d8b6a55',
      },
      lineItems: [
        {
          id: 'b2c3d4e5-6f7a-8b9c-0d1e-2f3a4b5c6d7e',
          description: 'Financial advisory',
          quantity: 5,
          unitPrice: 500,
          unitType: 'hour',
          taxRate: 25,
          projectRef: {
            id: '5a9f7eb7-3dbc-4afc-9e12-71e4f7c3aa21',
            projectName: 'Year End Review',
            projectNumber: 'P-002',
          },
          costCenterRef: {
            tagId: '8f6ff36a-2a6e-4f58-b37a-6e3e31acfa01',
            tagName: 'South',
          },
        },
      ],
      uploadRefs: [
        {
          id: '34e1c9a5-7b2d-4f86-8a31-6d2c5f9b7e40',
        },
      ],
    },
  ],
}

/**
 * Three supplier invoices reconstructed from a live Bokio sync on 2026-09-29
 * (observed on live data; ids, dates and supplier are placeholders). Each has
 * two `lineItems`, and in every case `totalAmount` = Σ quantity × unitPrice
 * × 1.25: `unitPrice` excludes VAT, `totalAmount` includes it. The live record
 * showed the amounts; `taxRate` 25 on each line is assumed from that 1.25
 * (Sweden's standard rate), not read off it.
 *
 *   A: 1 × 400 + 2 × 800  = 2000 net → totalAmount 2500
 *   B: 1 × 800 + 3 × 800  = 3200 net → totalAmount 4000
 *   C: 4 × 800 + 1 × 1200 = 4400 net → totalAmount 5500
 */
function liveSupplierInvoice(
  n: string,
  totalAmount: number,
  lines: Array<[quantity: number, unitPrice: number]>,
) {
  return {
    id: `00000000-0000-4000-8000-00000000000${n}`,
    supplierRef: { id: '11111111-1111-4111-8111-111111111111', name: 'Live Supplier AB' },
    invoiceNumber: `LIVE-${n}`,
    invoiceDate: '2026-09-01',
    dueDate: '2026-09-30',
    totalAmount,
    remainingAmount: totalAmount,
    currency: 'SEK',
    currencyRate: 1,
    journalEntryRef: null,
    lineItems: lines.map(([quantity, unitPrice], i) => ({
      id: `00000000-0000-4000-8000-0000000000${n}${i}`,
      description: `Line ${i + 1}`,
      quantity,
      unitPrice,
      unitType: 'piece',
      taxRate: 25,
      projectRef: null,
      costCenterRef: null,
    })),
    uploadRefs: [],
  }
}

export const LIVE_SUPPLIER_INVOICE_A = liveSupplierInvoice('1', 2500, [
  [1, 400],
  [2, 800],
])
export const LIVE_SUPPLIER_INVOICE_B = liveSupplierInvoice('2', 4000, [
  [1, 800],
  [3, 800],
])
export const LIVE_SUPPLIER_INVOICE_C = liveSupplierInvoice('3', 5500, [
  [4, 800],
  [1, 1200],
])

/** A deep copy typed as the adapter's row type, so a test can never mutate a fixture. */
export function copyOf<T>(fixture: unknown): T {
  return structuredClone(fixture) as T
}

/** https://docs.bokio.se/reference/get-supplier-by-id.md (example "Supplier found") */
export const SUPPLIER = {
  id: '12345678-abcd-1234-abcd-1234567890ab',
  name: 'Example Supplier',
  orgNumber: '556677-8899',
  vatNumber: 'SE123456789001',
  currency: 'SEK',
  address: {
    line1: 'Älvsborgsvägen 10',
    line2: 'c/o Test',
    city: 'Gothenburg',
    postalCode: '123 45',
    country: 'SE',
  },
  paymentDetails: {
    type: 'bankgiro',
    bankgiroNumber: '5174-8895',
  },
}

/** https://docs.bokio.se/reference/get-suppliers.md: the `supplier` schema example, the only row example the page documents */
export const SUPPLIER_SCHEMA_EXAMPLE = {
  id: '12345678-abcd-1234-abcd-1234567890ab',
  name: 'Example Supplier',
  orgNumber: '556677-8899',
  vatNumber: 'SE123456789001',
  currency: 'SEK',
  address: {
    line1: 'Älvsborgsvägen 10',
    line2: 'c/o Test',
    city: 'Gothenburg',
    postalCode: '123 45',
    country: 'SE',
  },
  paymentDetails: {
    type: 'bankgiro',
    bankgiroNumber: '1234-5678',
  },
}

/** https://docs.bokio.se/reference/post-supplier.md (example "Supplier created") */
export const SUPPLIER_CREATED = {
  id: '12345678-abcd-1234-abcd-1234567890ab',
  name: 'Supplier ABC',
  orgNumber: '556677-8899',
  vatNumber: 'SE123456789001',
  currency: 'SEK',
  address: {
    line1: 'Älvsborgsvägen 10',
    line2: 'c/o Test',
    city: 'Gothenburg',
    postalCode: '123 45',
    country: 'SE',
  },
  paymentDetails: {
    type: 'bankgiro',
    bankgiroNumber: '1234-5678',
  },
}

/** https://docs.bokio.se/reference/put-supplier.md (example "Supplier updated") */
export const SUPPLIER_UPDATED = {
  id: '12345678-abcd-1234-abcd-1234567890ab',
  name: 'Updated Supplier ABC',
  orgNumber: '556677-8899',
  vatNumber: 'SE123456789001',
  currency: 'SEK',
  address: {
    line1: 'Älvsborgsvägen 10',
    line2: 'c/o Test',
    city: 'Gothenburg',
    postalCode: '123 45',
    country: 'SE',
  },
  paymentDetails: {
    type: 'internationalPayment',
    iban: 'SE1234567890123456789012',
    bic: 'SWEDSESS',
  },
}

/** https://docs.bokio.se/reference/get-fiscal-years.md: the `fiscalYear` schema example */
export const FISCAL_YEAR = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  startDate: '2023-01-01',
  endDate: '2023-12-31',
  accountingMethod: 'accrual',
  status: 'open',
}

/** https://docs.bokio.se/reference/post-supplier-invoice.md (example "Supplier invoice created") */
export const SUPPLIER_INVOICE_CREATED = {
  id: '6f6b2f17-3c4a-4a69-9f2d-3f5d7e1b8c90',
  supplierRef: {
    id: '6f6b2f17-3c4a-4a69-9f2d-3f5d7e1b8c90',
    name: 'Supplier AB',
  },
  invoiceNumber: 'INV-001',
  invoiceDate: '2023-10-01',
  dueDate: '2023-10-15',
  totalAmount: 1000,
  remainingAmount: 1000,
  currency: 'SEK',
  currencyRate: 1,
  journalEntryRef: {
    id: '2d8ce6b4-1f3a-46a5-8a9d-5b7f2c4e9d10',
  },
  lineItems: [
    {
      id: 'a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
      description: 'Consulting',
      quantity: 10,
      unitPrice: 100,
      unitType: 'hour',
      taxRate: 25,
      projectRef: {
        id: '4f8f6da6-4cbc-4bfc-8d23-67d5f6f2dd9b',
        projectName: 'Website Redesign',
        projectNumber: 'P-001',
      },
      costCenterRef: {
        tagId: '7e5ee25f-1f5d-4e47-a26f-5d2d20fbef90',
        tagName: 'Nord',
      },
    },
  ],
}

/** https://docs.bokio.se/reference/put-supplier-invoice.md (example "Supplier invoice updated") */
export const SUPPLIER_INVOICE_UPDATED = {
  id: '6f6b2f17-3c4a-4a69-9f2d-3f5d7e1b8c90',
  supplierRef: {
    id: '6f6b2f17-3c4a-4a69-9f2d-3f5d7e1b8c90',
    name: 'Supplier AB',
  },
  invoiceNumber: 'INV-001',
  invoiceDate: '2023-10-01',
  dueDate: '2023-10-15',
  totalAmount: 1000,
  remainingAmount: 1000,
  currency: 'SEK',
  currencyRate: 1,
  journalEntryRef: {
    id: '2d8ce6b4-1f3a-46a5-8a9d-5b7f2c4e9d10',
  },
  lineItems: [
    {
      id: 'a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
      description: 'Consulting',
      quantity: 10,
      unitPrice: 100,
      unitType: 'hour',
      taxRate: 25,
      projectRef: {
        id: '4f8f6da6-4cbc-4bfc-8d23-67d5f6f2dd9b',
        projectName: 'Website Redesign',
        projectNumber: 'P-001',
      },
      costCenterRef: {
        tagId: '7e5ee25f-1f5d-4e47-a26f-5d2d20fbef90',
        tagName: 'Nord',
      },
    },
  ],
}

/** https://docs.bokio.se/reference/post-invoices-invoiceid-credit.md (example "createdCreditNote") */
export const CREDIT_NOTE_CREATED = {
  id: 'b529df79-eb7f-5ef0-a8dc-c2b71f953554',
  status: 'draft',
  invoiceNumber: null,
  invoiceRef: {
    id: 'a419cf69-db6f-4de9-992c-b1a60942a443',
    invoiceNumber: 'IN-2024-001',
  },
  customerRef: {
    id: '55c899c5-82b2-47fa-9c51-e35fc9b26443',
    name: 'customer 1',
    customerNumber: 'CUST-001',
  },
  contactDetailRef: {
    id: 'd3b07384-d9a0-4c9b-8b3a-6e1f2a5c8d4e',
    email: 'contact@customer1.com',
    phone: '+46701234567',
  },
  currency: 'SEK',
  currencyRate: 1,
  totalAmount: 100,
  totalTax: 25,
  paidAmount: 0,
  creditDate: '2024-10-15',
  dueDate: '2024-11-15',
  publishedDateTime: null,
  lineItems: [
    {
      id: 1,
      itemRef: {
        id: '55c899c5-82b2-47fa-9c51-e35fc9b26443',
        description: 'Product 1',
      },
      description: 'Product 1',
      itemType: 'salesItem',
      productType: 'goods',
      quantity: 2,
      unitPrice: 100,
      taxRate: 25,
      discount: {
        type: 'amount',
        value: 100,
      },
    },
  ],
  billingAddress: {
    line1: 'Älvsborgsvägen 10',
    line2: null,
    city: 'Göteborg',
    postalCode: '123 45',
    country: 'SE',
  },
  deliveryAddress: {
    line1: 'Delivery Street 15',
    line2: 'Floor 2',
    city: 'Stockholm',
    postalCode: '111 11',
    country: 'SE',
  },
  attachmentRefs: [
    {
      id: '240a4af0-edfd-47b1-b4ab-f30450eaac19',
      fileName: 'myfile.pdf',
    },
    {
      id: '94a8f806-8493-40f6-9d5b-0495c84f8ab9',
      fileName: 'myfile2.pdf',
    },
  ],
  metadata: {
    project: 'Website Redesign',
    department: 'IT',
    externalId: 'EXT-INV-2024-001',
  },
}

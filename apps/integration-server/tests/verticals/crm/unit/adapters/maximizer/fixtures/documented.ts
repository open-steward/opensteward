/**
 * Rows built from values in the first-party Octopus API docs
 * (developer.maximizer.com/reference/octopus-api-docs-*, fetched 2026-09-25)
 * and the first-party Postman collection (github.com/maximizercrm/octopus-api,
 * "Field and Object Types"). Octopus publishes few Read responses, so where a
 * Read example shows only the Scope, the values come from the same object's
 * Create/Update example or the field-type pages:
 *
 *   Read Query Syntax, "AbEntry read response example":
 *     { "Key":"Q29udGFjdAkwMDEwMDIwMDA2MTMwNjM2NzExNTZDCTU=", "Type": "Company",
 *       "CompanyName":"ABC Wine Shop" }
 *   DateTimeField: "CreationDate":{ "Value":"2015-01-20T20:37:51Z", ... }
 *   EmailField: { "Email":"escona@maximizer.com" }
 *   PhoneField: { "Phone":"123-456-7890" }
 *   CurrencyField: { "Value":1234.0, "DisplayValue":"CAD1,234.00", "CurrencyCode":"CAD" }
 *   AbEntry "Create - Contact": "FirstName": "Marty", "LastName": "McFly",
 *     "Address": { "AddressLine1": "1234 Main St.", "City": "Anytown",
 *     "StateProvince": "BC", "ZipCode": "12345", "Country": "CAN" }
 *   Opportunity "Validate" response: "AbEntryKey":
 *     "Q29tcGFueQkyMjA1MDUyNTIyMjczODY2NDAwMjlDCTA=", "SalesProcessSetupKey":
 *     "U2FsZXNQcm9jZXNzCURFRkFVTFQJMA==", "SalesStageSetupKey":
 *     "U2FsZXNQcm9jZXNzU3RhZ2VTZXR1cAkyMjA0MDYyNTEzNTIzMjM3MzAwMDZHCTA="
 *   SalesProcessSetup Create/Update, SalesStageSetup Create/Update,
 *   Task Create/Update, Note Create/Update: Keys and values below.
 */
export const documentedContact = () => ({
  Key: 'Q29udGFjdAkyMjA1MDUyNTIyMjczODY2NDAwMjlDCTE=',
  Type: 'Contact',
  FirstName: 'Marty',
  LastName: 'McFly',
  Email: 'escona@maximizer.com',
  Phone: '123-456-7890',
  Parent: { Key: 'Q29tcGFueQkyNTEwMjQyNTEwNTQ0OTU5NTAwMDFDCTA=', Type: 'Company' },
  Address: {
    AddressLine1: '1234 Main St.',
    City: 'Anytown',
    StateProvince: 'BC',
    ZipCode: '12345',
    Country: 'CAN',
  },
  CreationDate: '2015-01-20T20:37:51Z',
})

export const documentedCompany = () => ({
  Key: 'Q29udGFjdAkwMDEwMDIwMDA2MTMwNjM2NzExNTZDCTU=',
  Type: 'Company',
  CompanyName: 'ABC Wine Shop',
  Phone: '123-456-7890',
  Address: {
    AddressLine1: '1234 Main St.',
    City: 'Anytown',
    StateProvince: 'BC',
    ZipCode: '12345',
    Country: 'CAN',
  },
  CreationDate: '2015-01-20T20:37:51Z',
})

export const documentedDeal = () => ({
  Key: 'T3Bwb3J0dW5pdHkJMjUwMTAzMjUxNTUwMzE0NTIwMDExTwkw',
  Objective: 'Test Objective',
  Status: { Key: 2, DisplayValue: 'In Progress' },
  ForecastRevenue: { Value: 1234.0, CurrencyCode: 'CAD' },
  AbEntry: { Key: 'Q29tcGFueQkyMjA1MDUyNTIyMjczODY2NDAwMjlDCTA=', Type: 'Company' },
  SalesProcessSetupKey: 'U2FsZXNQcm9jZXNzCURFRkFVTFQJMA==',
  SalesStageSetupKey: 'U2FsZXNQcm9jZXNzU3RhZ2VTZXR1cAkyMjA0MDYyNTEzNTIzMjM3MzAwMDZHCTA=',
  CurrentSalesStage: { Description: 'First contact' },
  CreationDate: '2015-01-20T20:37:51Z',
})

export const documentedSalesProcess = () => ({
  Key: 'U2FsZXNQcm9jZXNzCTI1MDEwMTAwMDAwMDA3NDI1OTI2MTBHCTA=',
  Description: 'Sales process for opportunities',
})

export const documentedSalesStage = () => ({
  Key: 'U2FsZXNQcm9jZXNzU3RhZ2VTZXR1cAkyNTAxMDIwMDAwMDAwOTE0MTI1NDYwRwkw',
  SalesProcessSetupKey: 'U2FsZXNQcm9jZXNzCTI1MDEwMTAwMDAwMDA3NDI1OTI2MTBHCTA=',
  Description: 'First contact',
  ProbabilityClose: 10,
  TargetAge: 5,
})

export const documentedTask = () => ({
  Key: 'VGFzawkzNQ==',
  Activity: 'Call',
  DateTime: '2025-01-01',
  Completed: false,
})

export const documentedNote = () => ({
  Key: 'Tm90ZQkzODEz',
  Text: 'Updating this note using postman',
  DateTime: '2018-04-20T11:12:13',
  ParentKey: 'QWJFbnRyeQlERU1PXzFDCTA=',
})

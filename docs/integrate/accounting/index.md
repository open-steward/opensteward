---
vertical: accounting
title: Accounting
last_verified: 2026-06-14
written_by: claude
---

# Accounting (`accounting`)

Unified read surface across accounting / bookkeeping / ERP platforms. 281 adapters. Reference adapter: `fortnox`.

## Canonical schema

| Resource | Purpose |
|---|---|
| `Organization` | Company profile attached to the connection (singleton). |
| `Account` | Chart of accounts: GL accounts, codes, types, taxonomy. |
| `Contact` | Customers / suppliers / vendors. Same shape, distinguished by usage. |
| `Invoice` | Accounts-receivable invoices with line items. |
| `Bill` | Accounts-payable vendor bills. |
| `CreditMemo` | Credit notes against invoices or bills. |
| `Expense` | Expense records — receipts, employee expenses, mileage. |
| `Journal` | Manual and system-generated postings. |
| `Transaction` | Payments / receipts / transfers / reconciled bank lines. |
| `TaxRate` | Tax rates configured in the accounting platform. |
| `Order` | Sales / purchase orders (for platforms that track them). |
| `SalesOrder` | Standalone sales orders (where distinct from `Order`). |
| `PurchaseOrder` | Standalone purchase orders. |

## Endpoints

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/accounting/organizations` | Singleton — returns one. |
| GET | `/v1/accounting/accounts` | Chart of accounts. |
| GET | `/v1/accounting/contacts` | All counterparties. |
| GET | `/v1/accounting/invoices` | AR invoices. |
| GET | `/v1/accounting/bills` | AP bills. |
| GET | `/v1/accounting/creditmemos` | Credit notes. |
| GET | `/v1/accounting/expenses` | Expenses. |
| GET | `/v1/accounting/journals` | Journal entries. |
| GET | `/v1/accounting/transactions` | Reconciled lines + payments. |
| GET | `/v1/accounting/taxrates` | Tax rates. |
| GET | `/v1/accounting/orders` | Combined sales + purchase orders. |
| GET | `/v1/accounting/salesorders` | Sales orders only. |
| GET | `/v1/accounting/purchaseorders` | Purchase orders only. |

## Refused at the schema level

- Banking integrations and direct bank-feed credentials
- Tax-filing submissions and signed e-filings
- Document attachments (PDFs, receipts) beyond URL pointers
- Embedded reports / saved dashboards

## Authentication

Tenant mode (`Authorization: Bearer os_…`). Each `/v1/accounting/*` request requires `connection_id`. Most adapters are OAuth 2.0; the long tail uses API key / Basic / session-cookie. See [`docs/dev-api.md`](../../dev-api.md) for the unified auth contract.

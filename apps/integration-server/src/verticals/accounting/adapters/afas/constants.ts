/**
 * AFAS Profit REST API constants.
 *
 * Base URL: https://{environmentId}.rest.afas.online/profitrestservices/connectors/
 *   where {environmentId} is the customer's 5-digit AFAS company code.
 *
 * Auth: Authorization: AfasToken <base64('<token><version>1</version><data>{apiKey}</data></token>')>
 *
 * Docs: https://docs.afas.help/profit/en/start
 */

/** Base URL template — {environmentId} is substituted at runtime */
export const AFAS_API_BASE_TEMPLATE =
  'https://{environmentId}.rest.afas.online/profitrestservices/connectors/'

// Standard GetConnector names (read)
export const CONNECTOR_SALES_INVOICES = 'Profit_SalesInvoices'
export const CONNECTOR_PURCHASE_INVOICES = 'Profit_PurchaseInvoices'
export const CONNECTOR_CREDIT_NOTES = 'Profit_CreditNotes'
export const CONNECTOR_DEBTORS = 'Profit_Debtors'
export const CONNECTOR_CREDITORS = 'Profit_Creditors'
export const CONNECTOR_FINANCIAL_ACCOUNTS = 'Profit_FinancialAccounts'
export const CONNECTOR_EMPLOYERS = 'Profit_Employers'
export const CONNECTOR_TRANSACTIONS = 'Profit_Transactions'
export const CONNECTOR_VAT_CODES = 'Profit_VAT_code'
export const CONNECTOR_DECLARATIONS = 'Profit_Declaraties'
export const CONNECTOR_JOURNALS = 'Profit_Journals'
export const CONNECTOR_DELIVERY_ORDERS = 'Profit_DeliveryOrders'
export const CONNECTOR_PURCHASE_ORDERS = 'Profit_PurchaseOrders'
export const CONNECTOR_SALES_ORDERS = 'Profit_SalesOrders'

// Pagination — AFAS uses skip/take; default and max values
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1000

// QuickFile does not expose a dedicated tax rate endpoint.
// VAT is embedded in invoice/purchase line items via TaxPercentage fields.
// This file is intentionally minimal; the adapter does not implement listTaxRates.
export {}

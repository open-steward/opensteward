/**
 * ISO 4217 currency codes — common subset with display metadata.
 *
 * Standard: ISO 4217:2015
 * Source: https://www.iso.org/iso-4217-currency-codes.html
 */

export interface CurrencyInfo {
  /** ISO 4217 alphabetic code */
  code: string
  /** English currency name */
  name: string
  /** Currency symbol */
  symbol: string
  /** Number of decimal places (minor units) */
  decimals: number
}

/** ISO 4217 code → currency metadata. Common subset (~60 most-used currencies). */
export const CURRENCIES: Record<string, CurrencyInfo> = {
  // Major global currencies
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0 },
  CHF: { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimals: 2 },
  CAD: { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', decimals: 2 },
  AUD: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2 },
  CNY: { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimals: 2 },

  // Nordics
  SEK: { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', decimals: 2 },
  NOK: { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', decimals: 2 },
  DKK: { code: 'DKK', name: 'Danish Krone', symbol: 'kr', decimals: 2 },
  ISK: { code: 'ISK', name: 'Icelandic Króna', symbol: 'kr', decimals: 0 },

  // Europe
  PLN: { code: 'PLN', name: 'Polish Zloty', symbol: 'zł', decimals: 2 },
  CZK: { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', decimals: 2 },
  HUF: { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft', decimals: 2 },
  RON: { code: 'RON', name: 'Romanian Leu', symbol: 'lei', decimals: 2 },
  BGN: { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв', decimals: 2 },
  HRK: { code: 'HRK', name: 'Croatian Kuna', symbol: 'kn', decimals: 2 },
  TRY: { code: 'TRY', name: 'Turkish Lira', symbol: '₺', decimals: 2 },
  RUB: { code: 'RUB', name: 'Russian Ruble', symbol: '₽', decimals: 2 },
  UAH: { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴', decimals: 2 },

  // LATAM
  BRL: { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', decimals: 2 },
  MXN: { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$', decimals: 2 },
  ARS: { code: 'ARS', name: 'Argentine Peso', symbol: 'AR$', decimals: 2 },
  CLP: { code: 'CLP', name: 'Chilean Peso', symbol: 'CL$', decimals: 0 },
  COP: { code: 'COP', name: 'Colombian Peso', symbol: 'CO$', decimals: 2 },
  PEN: { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/', decimals: 2 },
  UYU: { code: 'UYU', name: 'Uruguayan Peso', symbol: '$U', decimals: 2 },

  // Asia
  INR: { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 2 },
  KRW: { code: 'KRW', name: 'South Korean Won', symbol: '₩', decimals: 0 },
  SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2 },
  MYR: { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', decimals: 2 },
  THB: { code: 'THB', name: 'Thai Baht', symbol: '฿', decimals: 2 },
  IDR: { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', decimals: 2 },
  PHP: { code: 'PHP', name: 'Philippine Peso', symbol: '₱', decimals: 2 },
  VND: { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimals: 0 },
  TWD: { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', decimals: 2 },
  HKD: { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', decimals: 2 },
  PKR: { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', decimals: 2 },
  BDT: { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', decimals: 2 },

  // Middle East / Africa
  AED: { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimals: 2 },
  SAR: { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', decimals: 2 },
  QAR: { code: 'QAR', name: 'Qatari Riyal', symbol: 'ر.ق', decimals: 2 },
  ILS: { code: 'ILS', name: 'Israeli Shekel', symbol: '₪', decimals: 2 },
  EGP: { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', decimals: 2 },
  ZAR: { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimals: 2 },
  NGN: { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', decimals: 2 },
  KES: { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', decimals: 2 },

  // Oceania
  NZD: { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', decimals: 2 },
}

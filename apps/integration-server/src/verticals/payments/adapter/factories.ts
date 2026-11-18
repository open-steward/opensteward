/**
 * Adapter factories — lazy constructors keyed by platform slug. The
 * AdapterRegistry reads this map at boot to discover which payments adapters
 * exist; AdapterSettingsStore decides which ones get instantiated.
 */
import type { AdapterFactory } from '@opensteward/shared'
import type { PaymentsAdapter } from './interface'

// Core gateways
import { StripeAdapter } from '../adapters/stripe'
import { PayPalAdapter } from '../adapters/paypal'
import { AdyenAdapter } from '../adapters/adyen'
import { SquareAdapter } from '../adapters/square'
import { BraintreeAdapter } from '../adapters/braintree'
import { MollieAdapter } from '../adapters/mollie'
import { CheckoutComAdapter } from '../adapters/checkout-com'
import { GoCardlessAdapter } from '../adapters/gocardless'
import { RazorpayAdapter } from '../adapters/razorpay'
import { MercadoPagoAdapter } from '../adapters/mercado-pago'
// Enterprise gateways, BNPL and billing platforms
import { KlarnaAdapter } from '../adapters/klarna'
import { AffirmAdapter } from '../adapters/affirm'
import { AfterpayAdapter } from '../adapters/afterpay'
import { AuthorizeNetAdapter } from '../adapters/authorize-net'
import { WorldpayFisAdapter } from '../adapters/worldpay-fis'
import { CybersourceAdapter } from '../adapters/cybersource'
import { ChargebeeAdapter } from '../adapters/chargebee'
import { RecurlyAdapter } from '../adapters/recurly'
import { PaddleAdapter } from '../adapters/paddle'
import { PaystackAdapter } from '../adapters/paystack'
import { FlutterwaveAdapter } from '../adapters/flutterwave'
import { DLocalAdapter } from '../adapters/dlocal'
// Regional and specialty processors (mostly api-key REST)
import { CashfreeAdapter } from '../adapters/cashfree'
import { ConektaAdapter } from '../adapters/conekta'
import { EbanxAdapter } from '../adapters/ebanx'
import { BluesnapAdapter } from '../adapters/bluesnap'
import { CieloAdapter } from '../adapters/cielo'
import { AirwallexAdapter } from '../adapters/airwallex'
import { TwoC2PAdapter } from '../adapters/2c2p'
import { AmazonPayAdapter } from '../adapters/amazon-pay'
import { AmazonPaymentServicesAdapter } from '../adapters/amazon-payment-services'
import { ApexxAdapter } from '../adapters/apexx'
import { AsaasAdapter } from '../adapters/asaas'
import { AtomeAdapter } from '../adapters/atome'
import { BamboraAdapter } from '../adapters/bambora'
import { BelvoAdapter } from '../adapters/belvo'
import { BilldeskAdapter } from '../adapters/billdesk'
import { BillieAdapter } from '../adapters/billie'
import { BitpayAdapter } from '../adapters/bitpay'
import { BitsoBusinessAdapter } from '../adapters/bitso-business'
import { BoltAdapter } from '../adapters/bolt'
import { BridgeOpenBankingAdapter } from '../adapters/bridge-open-banking'
import { CcavenueAdapter } from '../adapters/ccavenue'
import { CellpointDigitalAdapter } from '../adapters/cellpoint-digital'
import { CellulantAdapter } from '../adapters/cellulant'
import { CircleAdapter } from '../adapters/circle'
import { CoingateAdapter } from '../adapters/coingate'
import { CoinpaymentsAdapter } from '../adapters/coinpayments'
import { ComputopAdapter } from '../adapters/computop'
import { CrossmintAdapter } from '../adapters/crossmint'
import { DecentroAdapter } from '../adapters/decentro'
import { DodoPaymentsAdapter } from '../adapters/dodo-payments'
import { DokuAdapter } from '../adapters/doku'
import { DwollaAdapter } from '../adapters/dwolla'
import { EasebuzzAdapter } from '../adapters/easebuzz'
import { EwayAdapter } from '../adapters/eway'
import { FaspayAdapter } from '../adapters/faspay'
import { FastspringAdapter } from '../adapters/fastspring'
import { FawryAdapter } from '../adapters/fawry'
import { FinixAdapter } from '../adapters/finix'
import { FiservAdapter } from '../adapters/fiserv'
import { GeideaAdapter } from '../adapters/geidea'
import { GlobalPaymentsAdapter } from '../adapters/global-payments'
import { Gr4vyAdapter } from '../adapters/gr4vy'
import { HelcimAdapter } from '../adapters/helcim'
import { HitpayAdapter } from '../adapters/hitpay'
import { HyperpayAdapter } from '../adapters/hyperpay'
import { HyperswitchAdapter } from '../adapters/hyperswitch'
import { InstamojoAdapter } from '../adapters/instamojo'
import { IntasendAdapter } from '../adapters/intasend'
import { InterswitchAdapter } from '../adapters/interswitch'
import { Ipay88Adapter } from '../adapters/ipay88'
import { IuguAdapter } from '../adapters/iugu'
import { IxopayAdapter } from '../adapters/ixopay'
import { IyzicoAdapter } from '../adapters/iyzico'
import { JuspayAdapter } from '../adapters/juspay'
import { KillbillAdapter } from '../adapters/killbill'
import { KushkiAdapter } from '../adapters/kushki'
import { LagoAdapter } from '../adapters/lago'
import { MidtransAdapter } from '../adapters/midtrans'
import { ModernTreasuryAdapter } from '../adapters/modern-treasury'
import { MonerisAdapter } from '../adapters/moneris'
import { MoovAdapter } from '../adapters/moov'
import { MoyasarAdapter } from '../adapters/moyasar'
import { MpesaAdapter } from '../adapters/mpesa'
import { MuralPayAdapter } from '../adapters/mural-pay'
import { MxAdapter } from '../adapters/mx'
import { MyfatoorahAdapter } from '../adapters/myfatoorah'
import { NearpayAdapter } from '../adapters/nearpay'
import { NetworkInternationalAdapter } from '../adapters/network-international'
import { NexiAdapter } from '../adapters/nexi'
import { NmiAdapter } from '../adapters/nmi'
import { NowpaymentsAdapter } from '../adapters/nowpayments'
import { NuveiAdapter } from '../adapters/nuvei'
import { OpenpayAdapter } from '../adapters/openpay'
import { OpnPaymentsAdapter } from '../adapters/opn-payments'
import { PagarmeAdapter } from '../adapters/pagarme'
import { PagseguroAdapter } from '../adapters/pagseguro'
import { PawapayAdapter } from '../adapters/pawapay'
import { PayabliAdapter } from '../adapters/payabli'
import { PaydockAdapter } from '../adapters/paydock'
import { PaymobAdapter } from '../adapters/paymob'
import { PayoneerAdapter } from '../adapters/payoneer'
import { PayrexxAdapter } from '../adapters/payrexx'
import { PaysafeAdapter } from '../adapters/paysafe'
import { PaytabsAdapter } from '../adapters/paytabs'
import { PaytmAdapter } from '../adapters/paytm'
import { PaytrAdapter } from '../adapters/paytr'
import { PaytrailAdapter } from '../adapters/paytrail'
import { PayuAdapter } from '../adapters/payu'
import { PeachPaymentsAdapter } from '../adapters/peach-payments'
import { PesapalAdapter } from '../adapters/pesapal'
import { PhonepeAdapter } from '../adapters/phonepe'
import { PinPaymentsAdapter } from '../adapters/pin-payments'
import { PlaidAdapter } from '../adapters/plaid'
import { PrimerAdapter } from '../adapters/primer'
import { RapydAdapter } from '../adapters/rapyd'
import { RebillAdapter } from '../adapters/rebill'
import { RebillyAdapter } from '../adapters/rebilly'
import { SaltEdgeAdapter } from '../adapters/salt-edge'
import { ScalapayAdapter } from '../adapters/scalapay'
import { SezzleAdapter } from '../adapters/sezzle'
import { SkrillAdapter } from '../adapters/skrill'
import { SolidgateAdapter } from '../adapters/solidgate'
import { SplititAdapter } from '../adapters/splitit'
import { SpotOnAdapter } from '../adapters/spoton'
import { SpreedlyAdapter } from '../adapters/spreedly'
import { StarkBankAdapter } from '../adapters/stark-bank'
import { StaxPaymentsAdapter } from '../adapters/stax-payments'
import { StitchAdapter } from '../adapters/stitch'
import { SumupAdapter } from '../adapters/sumup'
import { SwishAdapter } from '../adapters/swish'
import { TabbyAdapter } from '../adapters/tabby'
import { TamaraAdapter } from '../adapters/tamara'
import { TapPaymentsAdapter } from '../adapters/tap-payments'
import { TelrAdapter } from '../adapters/telr'
import { ThunesAdapter } from '../adapters/thunes'
import { TinkAdapter } from '../adapters/tink'
import { TipaltiAdapter } from '../adapters/tipalti'
import { TransfiAdapter } from '../adapters/transfi'
import { TripleAAdapter } from '../adapters/triple-a'
import { TrolleyAdapter } from '../adapters/trolley'
import { TrueLayerAdapter } from '../adapters/truelayer'
import { TrustlyAdapter } from '../adapters/trustly'
import { TyroAdapter } from '../adapters/tyro'
import { UnzerAdapter } from '../adapters/unzer'
import { UpaymentsAdapter } from '../adapters/upayments'
import { Verifone2checkoutAdapter } from '../adapters/verifone-2checkout'
import { VippsMobilepayAdapter } from '../adapters/vipps-mobilepay'
import { VivaComAdapter } from '../adapters/viva-com'
import { WiseAdapter } from '../adapters/wise'
import { WompiAdapter } from '../adapters/wompi'
import { WorldlineAdapter } from '../adapters/worldline'
import { XenditAdapter } from '../adapters/xendit'
import { YapilyAdapter } from '../adapters/yapily'
import { YapstoneAdapter } from '../adapters/yapstone'
import { YocoAdapter } from '../adapters/yoco'
import { ZipBnplAdapter } from '../adapters/zip-bnpl'
import { ZuoraAdapter } from '../adapters/zuora'

function factory<T extends PaymentsAdapter>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Ctor: new (...args: any[]) => T,
): AdapterFactory<T> {
  return (cfg) => new Ctor(cfg)
}

export const ADAPTER_FACTORIES: Record<string, AdapterFactory<PaymentsAdapter>> = {
  // Core gateways
  stripe: factory(StripeAdapter),
  paypal: factory(PayPalAdapter),
  adyen: factory(AdyenAdapter),
  square: factory(SquareAdapter),
  braintree: factory(BraintreeAdapter),
  mollie: factory(MollieAdapter),
  'checkout-com': factory(CheckoutComAdapter),
  gocardless: factory(GoCardlessAdapter),
  razorpay: factory(RazorpayAdapter),
  'mercado-pago': factory(MercadoPagoAdapter),
  // Enterprise gateways, BNPL and billing platforms
  klarna: factory(KlarnaAdapter),
  affirm: factory(AffirmAdapter),
  afterpay: factory(AfterpayAdapter),
  'authorize-net': factory(AuthorizeNetAdapter),
  'worldpay-fis': factory(WorldpayFisAdapter),
  cybersource: factory(CybersourceAdapter),
  chargebee: factory(ChargebeeAdapter),
  recurly: factory(RecurlyAdapter),
  paddle: factory(PaddleAdapter),
  paystack: factory(PaystackAdapter),
  flutterwave: factory(FlutterwaveAdapter),
  dlocal: factory(DLocalAdapter),
  // Regional and specialty processors (mostly api-key REST)
  cashfree: factory(CashfreeAdapter),
  conekta: factory(ConektaAdapter),
  ebanx: factory(EbanxAdapter),
  bluesnap: factory(BluesnapAdapter),
  cielo: factory(CieloAdapter),
  airwallex: factory(AirwallexAdapter),
  '2c2p': factory(TwoC2PAdapter),
  'amazon-pay': factory(AmazonPayAdapter),
  'amazon-payment-services': factory(AmazonPaymentServicesAdapter),
  apexx: factory(ApexxAdapter),
  asaas: factory(AsaasAdapter),
  atome: factory(AtomeAdapter),
  bambora: factory(BamboraAdapter),
  belvo: factory(BelvoAdapter),
  billdesk: factory(BilldeskAdapter),
  billie: factory(BillieAdapter),
  bitpay: factory(BitpayAdapter),
  'bitso-business': factory(BitsoBusinessAdapter),
  bolt: factory(BoltAdapter),
  'bridge-open-banking': factory(BridgeOpenBankingAdapter),
  ccavenue: factory(CcavenueAdapter),
  'cellpoint-digital': factory(CellpointDigitalAdapter),
  cellulant: factory(CellulantAdapter),
  circle: factory(CircleAdapter),
  coingate: factory(CoingateAdapter),
  coinpayments: factory(CoinpaymentsAdapter),
  computop: factory(ComputopAdapter),
  crossmint: factory(CrossmintAdapter),
  decentro: factory(DecentroAdapter),
  'dodo-payments': factory(DodoPaymentsAdapter),
  doku: factory(DokuAdapter),
  dwolla: factory(DwollaAdapter),
  easebuzz: factory(EasebuzzAdapter),
  eway: factory(EwayAdapter),
  faspay: factory(FaspayAdapter),
  fastspring: factory(FastspringAdapter),
  fawry: factory(FawryAdapter),
  finix: factory(FinixAdapter),
  fiserv: factory(FiservAdapter),
  geidea: factory(GeideaAdapter),
  'global-payments': factory(GlobalPaymentsAdapter),
  gr4vy: factory(Gr4vyAdapter),
  helcim: factory(HelcimAdapter),
  hitpay: factory(HitpayAdapter),
  hyperpay: factory(HyperpayAdapter),
  hyperswitch: factory(HyperswitchAdapter),
  instamojo: factory(InstamojoAdapter),
  intasend: factory(IntasendAdapter),
  interswitch: factory(InterswitchAdapter),
  ipay88: factory(Ipay88Adapter),
  iugu: factory(IuguAdapter),
  ixopay: factory(IxopayAdapter),
  iyzico: factory(IyzicoAdapter),
  juspay: factory(JuspayAdapter),
  killbill: factory(KillbillAdapter),
  kushki: factory(KushkiAdapter),
  lago: factory(LagoAdapter),
  midtrans: factory(MidtransAdapter),
  'modern-treasury': factory(ModernTreasuryAdapter),
  moneris: factory(MonerisAdapter),
  moov: factory(MoovAdapter),
  moyasar: factory(MoyasarAdapter),
  mpesa: factory(MpesaAdapter),
  'mural-pay': factory(MuralPayAdapter),
  mx: factory(MxAdapter),
  myfatoorah: factory(MyfatoorahAdapter),
  nearpay: factory(NearpayAdapter),
  'network-international': factory(NetworkInternationalAdapter),
  nexi: factory(NexiAdapter),
  nmi: factory(NmiAdapter),
  nowpayments: factory(NowpaymentsAdapter),
  nuvei: factory(NuveiAdapter),
  openpay: factory(OpenpayAdapter),
  'opn-payments': factory(OpnPaymentsAdapter),
  pagarme: factory(PagarmeAdapter),
  pagseguro: factory(PagseguroAdapter),
  pawapay: factory(PawapayAdapter),
  payabli: factory(PayabliAdapter),
  paydock: factory(PaydockAdapter),
  paymob: factory(PaymobAdapter),
  payoneer: factory(PayoneerAdapter),
  payrexx: factory(PayrexxAdapter),
  paysafe: factory(PaysafeAdapter),
  paytabs: factory(PaytabsAdapter),
  paytm: factory(PaytmAdapter),
  paytr: factory(PaytrAdapter),
  paytrail: factory(PaytrailAdapter),
  payu: factory(PayuAdapter),
  'peach-payments': factory(PeachPaymentsAdapter),
  pesapal: factory(PesapalAdapter),
  phonepe: factory(PhonepeAdapter),
  'pin-payments': factory(PinPaymentsAdapter),
  plaid: factory(PlaidAdapter),
  primer: factory(PrimerAdapter),
  rapyd: factory(RapydAdapter),
  rebill: factory(RebillAdapter),
  rebilly: factory(RebillyAdapter),
  'salt-edge': factory(SaltEdgeAdapter),
  scalapay: factory(ScalapayAdapter),
  sezzle: factory(SezzleAdapter),
  skrill: factory(SkrillAdapter),
  solidgate: factory(SolidgateAdapter),
  splitit: factory(SplititAdapter),
  spoton: factory(SpotOnAdapter),
  spreedly: factory(SpreedlyAdapter),
  'stark-bank': factory(StarkBankAdapter),
  'stax-payments': factory(StaxPaymentsAdapter),
  stitch: factory(StitchAdapter),
  sumup: factory(SumupAdapter),
  swish: factory(SwishAdapter),
  tabby: factory(TabbyAdapter),
  tamara: factory(TamaraAdapter),
  'tap-payments': factory(TapPaymentsAdapter),
  telr: factory(TelrAdapter),
  thunes: factory(ThunesAdapter),
  tink: factory(TinkAdapter),
  tipalti: factory(TipaltiAdapter),
  transfi: factory(TransfiAdapter),
  'triple-a': factory(TripleAAdapter),
  trolley: factory(TrolleyAdapter),
  truelayer: factory(TrueLayerAdapter),
  trustly: factory(TrustlyAdapter),
  tyro: factory(TyroAdapter),
  unzer: factory(UnzerAdapter),
  upayments: factory(UpaymentsAdapter),
  'verifone-2checkout': factory(Verifone2checkoutAdapter),
  'vipps-mobilepay': factory(VippsMobilepayAdapter),
  'viva-com': factory(VivaComAdapter),
  wise: factory(WiseAdapter),
  wompi: factory(WompiAdapter),
  worldline: factory(WorldlineAdapter),
  xendit: factory(XenditAdapter),
  yapily: factory(YapilyAdapter),
  yapstone: factory(YapstoneAdapter),
  yoco: factory(YocoAdapter),
  'zip-bnpl': factory(ZipBnplAdapter),
  zuora: factory(ZuoraAdapter),
}

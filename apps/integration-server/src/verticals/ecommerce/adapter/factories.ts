/**
 * Adapter factories — lazy constructors keyed by platform slug.
 *
 * The AdapterRegistry reads this map at boot to discover which adapter
 * implementations exist, and the AdapterSettingsStore decides which ones
 * to actually instantiate based on persisted settings.
 */
import type { AdapterFactory } from '@opensteward/shared'
import type { EcommerceAdapter } from './interface'
import { ShopifyAdapter } from '../adapters/shopify'
import { WooCommerceAdapter } from '../adapters/woocommerce'
import { MagentoAdapter } from '../adapters/magento'
import { CommerceToolsAdapter } from '../adapters/commercetools'
import { AmazonSPAdapter } from '../adapters/amazon-sp'
import { SaleorAdapter } from '../adapters/saleor'
import { SquareAdapter } from '../adapters/square'
import { OroCommerceAdapter } from '../adapters/orocommerce'
import { BigCommerceAdapter } from '../adapters/bigcommerce'
import { EbayAdapter } from '../adapters/ebay'
import { PrestaShopAdapter } from '../adapters/prestashop'
import { EtsyAdapter } from '../adapters/etsy'
import { MedusaAdapter } from '../adapters/medusa'
import { VendureAdapter } from '../adapters/vendure'
import { ElasticPathAdapter } from '../adapters/elasticpath'
import { CommerceLayerAdapter } from '../adapters/commercelayer'
import { LightspeedRetailAdapter } from '../adapters/lightspeed-retail'
import { CloverAdapter } from '../adapters/clover'
import { WixAdapter } from '../adapters/wix'
import { ShopeeAdapter } from '../adapters/shopee'
import { LazadaAdapter } from '../adapters/lazada'
import { SquarespaceAdapter } from '../adapters/squarespace'
import { WebflowAdapter } from '../adapters/webflow'
import { EcwidAdapter } from '../adapters/ecwid'
import { VolusionAdapter } from '../adapters/volusion'
import { BigCartelAdapter } from '../adapters/bigcartel'
import { SpreeAdapter } from '../adapters/spree'
import { SyliusAdapter } from '../adapters/sylius'
import { ShopwareAdapter } from '../adapters/shopware'
import { SolidusAdapter } from '../adapters/solidus'
import { NopCommerceAdapter } from '../adapters/nopcommerce'
import { OpenCartAdapter } from '../adapters/opencart'
import { SwellAdapter } from '../adapters/swell'
import { CrystallizeAdapter } from '../adapters/crystallize'
import { FabricAdapter } from '../adapters/fabric'
import { MercadoLibreAdapter } from '../adapters/mercadolibre'
import { WalmartAdapter } from '../adapters/walmart'
import { TokopediaAdapter } from '../adapters/tokopedia'
import { FlipkartAdapter } from '../adapters/flipkart'
import { JdAdapter } from '../adapters/jdcom'
import { ToastAdapter } from '../adapters/toast'
import { RevelAdapter } from '../adapters/revel'
import { EposNowAdapter } from '../adapters/eposnow'
import { SapCommerceAdapter } from '../adapters/sap-commerce'
import { ZnodeAdapter } from '../adapters/znode'
import { ShopwareB2BAdapter } from '../adapters/shopware-b2b'
import { GumroadAdapter } from '../adapters/gumroad'
import { PatreonAdapter } from '../adapters/patreon'
import { GmarketAdapter } from '../adapters/gmarket'
import { FacebookShopAdapter } from '../adapters/facebook-shop'
import { TikTokShopAdapter } from '../adapters/tiktok-shop'
import { PinterestShopAdapter } from '../adapters/pinterest-shop'
import { BolAdapter } from '../adapters/bol'
import { AllegroAdapter } from '../adapters/allegro'
import { NeweggAdapter } from '../adapters/newegg'
import { NoonAdapter } from '../adapters/noon'
import { JumiaAdapter } from '../adapters/jumia'
import { DarazAdapter } from '../adapters/daraz'
import { RakutenAdapter } from '../adapters/rakuten'
import { CoupangAdapter } from '../adapters/coupang'
import { TmallAdapter } from '../adapters/tmall'
import { AlibabaAdapter } from '../adapters/alibaba'
import { PinduoduoAdapter } from '../adapters/pinduoduo'
import { KofiAdapter } from '../adapters/kofi'
import { BuyMeACoffeeAdapter } from '../adapters/buymeacoffee'
import { DrupalCommerceAdapter } from '../adapters/drupal-commerce'
import { XCartAdapter } from '../adapters/xcart'
import { AimeosAdapter } from '../adapters/aimeos'
import { BagistoAdapter } from '../adapters/bagisto'
import { ShuupAdapter } from '../adapters/shuup'
import { ThirtyBeesAdapter } from '../adapters/thirty-bees'
import { CsCartAdapter } from '../adapters/cscart'
import { VirtueMartAdapter } from '../adapters/virtuemart'
import { Shift4ShopAdapter } from '../adapters/shift4shop'
import { ZyroAdapter } from '../adapters/zyro'
import { IonosAdapter } from '../adapters/ionos'
import { KiboAdapter } from '../adapters/kibo'
import { OrckestraAdapter } from '../adapters/orckestra'
import { AnkorstoreAdapter } from '../adapters/ankorstore'
import { BagyAdapter } from '../adapters/bagy'
import { BaseEcAdapter } from '../adapters/base-ec'
import { BettercommerceAdapter } from '../adapters/bettercommerce'
import { BoldCommerceAdapter } from '../adapters/bold-commerce'
import { BrinkCommerceAdapter } from '../adapters/brink-commerce'
import { BumpaAdapter } from '../adapters/bumpa'
import { Cafe24Adapter } from '../adapters/cafe24'
import { CartpandaAdapter } from '../adapters/cartpanda'
import { CdiscountMarketplaceAdapter } from '../adapters/cdiscount-marketplace'
import { CentraAdapter } from '../adapters/centra'
import { ColormeShopAdapter } from '../adapters/colorme-shop'
import { DoocaCommerceAdapter } from '../adapters/dooca-commerce'
import { DukaanAdapter } from '../adapters/dukaan'
import { EpagesAdapter } from '../adapters/epages'
import { EvershopAdapter } from '../adapters/evershop'
import { FaireAdapter } from '../adapters/faire'
import { FalabellaAdapter } from '../adapters/falabella'
import { FastspringAdapter } from '../adapters/fastspring'
import { FnacMarketplaceAdapter } from '../adapters/fnac-marketplace'
import { FoxyIoAdapter } from '../adapters/foxy-io'
import { FyndAdapter } from '../adapters/fynd'
import { GambioAdapter } from '../adapters/gambio'
import { GodaddyWebsitesCommerceAdapter } from '../adapters/godaddy-websites-commerce'
import { GofrugalAdapter } from '../adapters/gofrugal'
import { HaravanAdapter } from '../adapters/haravan'
import { HepsiburadaAdapter } from '../adapters/hepsiburada'
import { IdosellAdapter } from '../adapters/idosell'
import { IkasAdapter } from '../adapters/ikas'
import { InsalesAdapter } from '../adapters/insales'
import { InstamojoAdapter } from '../adapters/instamojo'
import { IzbergAdapter } from '../adapters/izberg'
import { JimdoAdapter } from '../adapters/jimdo'
import { JoorAdapter } from '../adapters/joor'
import { JtlShopAdapter } from '../adapters/jtl-shop'
import { JumpsellerAdapter } from '../adapters/jumpseller'
import { KauflandMarketplaceAdapter } from '../adapters/kaufland-marketplace'
import { KoronaPosAdapter } from '../adapters/korona-pos'
import { LemonSqueezyAdapter } from '../adapters/lemon-squeezy'
import { LogicommerceAdapter } from '../adapters/logicommerce'
import { LojaIntegradaAdapter } from '../adapters/loja-integrada'
import { LoyverseAdapter } from '../adapters/loyverse'
import { ManomanoAdapter } from '../adapters/manomano'
import { MarketplacerAdapter } from '../adapters/marketplacer'
import { MiraklAdapter } from '../adapters/mirakl'
import { MycashflowAdapter } from '../adapters/mycashflow'
import { NacelleAdapter } from '../adapters/nacelle'
import { NhnCommerceAdapter } from '../adapters/nhn-commerce'
import { NorceAdapter } from '../adapters/norce'
import { NuorderAdapter } from '../adapters/nuorder'
import { OptimizelyConfiguredCommerceAdapter } from '../adapters/optimizely-configured-commerce'
import { OrderchampAdapter } from '../adapters/orderchamp'
import { OrdergrooveAdapter } from '../adapters/ordergroove'
import { OttoMarketAdapter } from '../adapters/otto-market'
import { OzonAdapter } from '../adapters/ozon'
import { PayhipAdapter } from '../adapters/payhip'
import { PepperiAdapter } from '../adapters/pepperi'
import { PetpoojaAdapter } from '../adapters/petpooja'
import { PlentyoneAdapter } from '../adapters/plentyone'
import { QuickbutikAdapter } from '../adapters/quickbutik'
import { RechargeAdapter } from '../adapters/recharge'
import { SalesforceCommerceCloudAdapter } from '../adapters/salesforce-commerce-cloud'
import { SallaAdapter } from '../adapters/salla'
import { SanaCommerceAdapter } from '../adapters/sana-commerce'
import { SapoAdapter } from '../adapters/sapo'
import { ScayleAdapter } from '../adapters/scayle'
import { SellfyAdapter } from '../adapters/sellfy'
import { SendowlAdapter } from '../adapters/sendowl'
import { SharetribeAdapter } from '../adapters/sharetribe'
import { ShogunAdapter } from '../adapters/shogun'
import { ShopaccinoAdapter } from '../adapters/shopaccino'
import { ShoperAdapter } from '../adapters/shoper'
import { ShopgateAdapter } from '../adapters/shopgate'
import { ShoplazzaAdapter } from '../adapters/shoplazza'
import { ShoplineAdapter } from '../adapters/shopline'
import { SkioAdapter } from '../adapters/skio'
import { SnipcartAdapter } from '../adapters/snipcart'
import { SprykerAdapter } from '../adapters/spryker'
import { StarwebAdapter } from '../adapters/starweb'
import { StayAiAdapter } from '../adapters/stay-ai'
import { StorehippoAdapter } from '../adapters/storehippo'
import { TemuAdapter } from '../adapters/temu'
import { TiendanubeAdapter } from '../adapters/tiendanube'
import { TrayCommerceAdapter } from '../adapters/tray-commerce'
import { TrendyolAdapter } from '../adapters/trendyol'
import { VirtoCommerceAdapter } from '../adapters/virto-commerce'
import { VndaAdapter } from '../adapters/vnda'
import { VtexAdapter } from '../adapters/vtex'
import { WayfairAdapter } from '../adapters/wayfair'
import { WbuyAdapter } from '../adapters/wbuy'
import { WeeblyAdapter } from '../adapters/weebly'
import { WildberriesAdapter } from '../adapters/wildberries'
import { WishAdapter } from '../adapters/wish'
import { XtCommerceAdapter } from '../adapters/xt-commerce'
import { YampiAdapter } from '../adapters/yampi'
import { YokartAdapter } from '../adapters/yokart'
import { ZalandoAdapter } from '../adapters/zalando'
import { ZidAdapter } from '../adapters/zid'

/**
 * Narrow the factory boilerplate. Each platform adapter has a slightly
 * different constructor signature, and the registry-level factory hands them
 * a generic `Record<string, unknown>`. This helper absorbs the type mismatch
 * in a single location so call sites stay tidy.
 */
function factory<T extends EcommerceAdapter>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Ctor: new (...args: any[]) => T,
): AdapterFactory<T> {
  return (cfg) => new Ctor(cfg)
}

export const ADAPTER_FACTORIES: Record<string, AdapterFactory<EcommerceAdapter>> = {
  shopify: factory(ShopifyAdapter),
  woocommerce: factory(WooCommerceAdapter),
  magento: factory(MagentoAdapter),
  commercetools: factory(CommerceToolsAdapter),
  'amazon-sp': factory(AmazonSPAdapter),
  saleor: factory(SaleorAdapter),
  square: factory(SquareAdapter),
  orocommerce: factory(OroCommerceAdapter),
  bigcommerce: factory(BigCommerceAdapter),
  ebay: factory(EbayAdapter),
  prestashop: factory(PrestaShopAdapter),
  etsy: factory(EtsyAdapter),
  medusa: factory(MedusaAdapter),
  vendure: factory(VendureAdapter),
  elasticpath: factory(ElasticPathAdapter),
  commercelayer: factory(CommerceLayerAdapter),
  'lightspeed-retail': factory(LightspeedRetailAdapter),
  clover: factory(CloverAdapter),
  wix: factory(WixAdapter),
  shopee: factory(ShopeeAdapter),
  lazada: factory(LazadaAdapter),
  squarespace: factory(SquarespaceAdapter),
  webflow: factory(WebflowAdapter),
  ecwid: factory(EcwidAdapter),
  volusion: factory(VolusionAdapter),
  bigcartel: factory(BigCartelAdapter),
  spree: factory(SpreeAdapter),
  sylius: factory(SyliusAdapter),
  shopware: factory(ShopwareAdapter),
  solidus: factory(SolidusAdapter),
  nopcommerce: factory(NopCommerceAdapter),
  opencart: factory(OpenCartAdapter),
  swell: factory(SwellAdapter),
  crystallize: factory(CrystallizeAdapter),
  fabric: factory(FabricAdapter),
  mercadolibre: factory(MercadoLibreAdapter),
  walmart: factory(WalmartAdapter),
  tokopedia: factory(TokopediaAdapter),
  flipkart: factory(FlipkartAdapter),
  jdcom: factory(JdAdapter),
  toast: factory(ToastAdapter),
  revel: factory(RevelAdapter),
  eposnow: factory(EposNowAdapter),
  'sap-commerce': factory(SapCommerceAdapter),
  znode: factory(ZnodeAdapter),
  'shopware-b2b': factory(ShopwareB2BAdapter),
  gumroad: factory(GumroadAdapter),
  patreon: factory(PatreonAdapter),
  gmarket: factory(GmarketAdapter),
  'facebook-shop': factory(FacebookShopAdapter),
  'tiktok-shop': factory(TikTokShopAdapter),
  'pinterest-shop': factory(PinterestShopAdapter),
  bol: factory(BolAdapter),
  allegro: factory(AllegroAdapter),
  newegg: factory(NeweggAdapter),
  // MENA / Africa / South Asia marketplaces
  noon: factory(NoonAdapter),
  jumia: factory(JumiaAdapter),
  daraz: factory(DarazAdapter),
  // Japan / Korea / China marketplaces
  rakuten: factory(RakutenAdapter),
  coupang: factory(CoupangAdapter),
  tmall: factory(TmallAdapter),
  // China B2B + creator
  alibaba: factory(AlibabaAdapter),
  pinduoduo: factory(PinduoduoAdapter),
  kofi: factory(KofiAdapter),
  // Creator + OSS
  buymeacoffee: factory(BuyMeACoffeeAdapter),
  'drupal-commerce': factory(DrupalCommerceAdapter),
  xcart: factory(XCartAdapter),
  // Framework-specific OSS (Laravel×2 + Django)
  aimeos: factory(AimeosAdapter),
  bagisto: factory(BagistoAdapter),
  shuup: factory(ShuupAdapter),
  // Legacy OSS
  'thirty-bees': factory(ThirtyBeesAdapter),
  cscart: factory(CsCartAdapter),
  virtuemart: factory(VirtueMartAdapter),
  // Declining hosted / niche
  shift4shop: factory(Shift4ShopAdapter),
  zyro: factory(ZyroAdapter),
  ionos: factory(IonosAdapter),
  // Niche enterprise headless
  kibo: factory(KiboAdapter),
  orckestra: factory(OrckestraAdapter),
  ankorstore: factory(AnkorstoreAdapter),
  bagy: factory(BagyAdapter),
  'base-ec': factory(BaseEcAdapter),
  bettercommerce: factory(BettercommerceAdapter),
  'bold-commerce': factory(BoldCommerceAdapter),
  'brink-commerce': factory(BrinkCommerceAdapter),
  bumpa: factory(BumpaAdapter),
  cafe24: factory(Cafe24Adapter),
  cartpanda: factory(CartpandaAdapter),
  'cdiscount-marketplace': factory(CdiscountMarketplaceAdapter),
  centra: factory(CentraAdapter),
  'colorme-shop': factory(ColormeShopAdapter),
  'dooca-commerce': factory(DoocaCommerceAdapter),
  dukaan: factory(DukaanAdapter),
  epages: factory(EpagesAdapter),
  evershop: factory(EvershopAdapter),
  faire: factory(FaireAdapter),
  falabella: factory(FalabellaAdapter),
  fastspring: factory(FastspringAdapter),
  'fnac-marketplace': factory(FnacMarketplaceAdapter),
  'foxy-io': factory(FoxyIoAdapter),
  fynd: factory(FyndAdapter),
  gambio: factory(GambioAdapter),
  'godaddy-websites-commerce': factory(GodaddyWebsitesCommerceAdapter),
  gofrugal: factory(GofrugalAdapter),
  haravan: factory(HaravanAdapter),
  hepsiburada: factory(HepsiburadaAdapter),
  idosell: factory(IdosellAdapter),
  ikas: factory(IkasAdapter),
  insales: factory(InsalesAdapter),
  instamojo: factory(InstamojoAdapter),
  izberg: factory(IzbergAdapter),
  jimdo: factory(JimdoAdapter),
  joor: factory(JoorAdapter),
  'jtl-shop': factory(JtlShopAdapter),
  jumpseller: factory(JumpsellerAdapter),
  'kaufland-marketplace': factory(KauflandMarketplaceAdapter),
  'korona-pos': factory(KoronaPosAdapter),
  'lemon-squeezy': factory(LemonSqueezyAdapter),
  logicommerce: factory(LogicommerceAdapter),
  'loja-integrada': factory(LojaIntegradaAdapter),
  loyverse: factory(LoyverseAdapter),
  manomano: factory(ManomanoAdapter),
  marketplacer: factory(MarketplacerAdapter),
  mirakl: factory(MiraklAdapter),
  mycashflow: factory(MycashflowAdapter),
  nacelle: factory(NacelleAdapter),
  'nhn-commerce': factory(NhnCommerceAdapter),
  norce: factory(NorceAdapter),
  nuorder: factory(NuorderAdapter),
  'optimizely-configured-commerce': factory(OptimizelyConfiguredCommerceAdapter),
  orderchamp: factory(OrderchampAdapter),
  ordergroove: factory(OrdergrooveAdapter),
  'otto-market': factory(OttoMarketAdapter),
  ozon: factory(OzonAdapter),
  payhip: factory(PayhipAdapter),
  pepperi: factory(PepperiAdapter),
  petpooja: factory(PetpoojaAdapter),
  plentyone: factory(PlentyoneAdapter),
  quickbutik: factory(QuickbutikAdapter),
  recharge: factory(RechargeAdapter),
  'salesforce-commerce-cloud': factory(SalesforceCommerceCloudAdapter),
  salla: factory(SallaAdapter),
  'sana-commerce': factory(SanaCommerceAdapter),
  sapo: factory(SapoAdapter),
  scayle: factory(ScayleAdapter),
  sellfy: factory(SellfyAdapter),
  sendowl: factory(SendowlAdapter),
  sharetribe: factory(SharetribeAdapter),
  shogun: factory(ShogunAdapter),
  shopaccino: factory(ShopaccinoAdapter),
  shoper: factory(ShoperAdapter),
  shopgate: factory(ShopgateAdapter),
  shoplazza: factory(ShoplazzaAdapter),
  shopline: factory(ShoplineAdapter),
  skio: factory(SkioAdapter),
  snipcart: factory(SnipcartAdapter),
  spryker: factory(SprykerAdapter),
  starweb: factory(StarwebAdapter),
  'stay-ai': factory(StayAiAdapter),
  storehippo: factory(StorehippoAdapter),
  temu: factory(TemuAdapter),
  tiendanube: factory(TiendanubeAdapter),
  'tray-commerce': factory(TrayCommerceAdapter),
  trendyol: factory(TrendyolAdapter),
  'virto-commerce': factory(VirtoCommerceAdapter),
  vnda: factory(VndaAdapter),
  vtex: factory(VtexAdapter),
  wayfair: factory(WayfairAdapter),
  wbuy: factory(WbuyAdapter),
  weebly: factory(WeeblyAdapter),
  wildberries: factory(WildberriesAdapter),
  wish: factory(WishAdapter),
  'xt-commerce': factory(XtCommerceAdapter),
  yampi: factory(YampiAdapter),
  yokart: factory(YokartAdapter),
  zalando: factory(ZalandoAdapter),
  zid: factory(ZidAdapter),
}

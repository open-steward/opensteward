/**
 * Adapter factories — lazy constructors keyed by platform slug.
 */
import type { AdapterFactory } from '@opensteward/shared'
import type { InventoryAdapter } from './interface'

// Inventory management platforms
import { Cin7CoreAdapter } from '../adapters/cin7-core'
import { LinnworksAdapter } from '../adapters/linnworks'
import { ZohoInventoryAdapter } from '../adapters/zoho-inventory'
import { NetSuiteInventoryAdapter } from '../adapters/netsuite-inventory'

// Inventory / order management platforms
import { UnleashedAdapter } from '../adapters/unleashed'
import { Cin7OmniAdapter } from '../adapters/cin7-omni'
import { BrightpearlAdapter } from '../adapters/brightpearl'
import { VeeqoAdapter } from '../adapters/veeqo'
import { KatanaAdapter } from '../adapters/katana'
import { InflowAdapter } from '../adapters/inflow'
import { FishbowlAdapter } from '../adapters/fishbowl'
import { FinaleInventoryAdapter } from '../adapters/finale-inventory'

// Inventory platforms / ERP inventory modules
import { SortlyAdapter } from '../adapters/sortly'
import { SkuVaultAdapter } from '../adapters/skuvault'
import { OrdoroAdapter } from '../adapters/ordoro'
import { MegaventoryAdapter } from '../adapters/megaventory'
import { ErplyAdapter } from '../adapters/erply'
import { OdooInventoryAdapter } from '../adapters/odoo-inventory'
import { AcumaticaInventoryAdapter } from '../adapters/acumatica-inventory'

// Regional / China ERP
import { JushuitanAdapter } from '../adapters/jushuitan'
import { GofrugalAdapter } from '../adapters/gofrugal'

// 3PL inventory surfaces
import { ShipBobInventoryAdapter } from '../adapters/shipbob-inventory'
import { ShipHeroInventoryAdapter } from '../adapters/shiphero-inventory'
import { LogiwaInventoryAdapter } from '../adapters/logiwa-inventory'
import { ExtensivInventoryAdapter } from '../adapters/extensiv-inventory'
import { Dynamics365BcInventoryAdapter } from '../adapters/dynamics-365-bc-inventory'

// Supply-chain ERP
import { Dynamics365ScmAdapter } from '../adapters/dynamics-365-scm'

// Open-source ERP
import { OpenbravoAdapter } from '../adapters/openbravo'

// Manufacturing ERP
import { MrpeasyAdapter } from '../adapters/mrpeasy'

// Retail POS inventory
import { LightspeedInventoryAdapter } from '../adapters/lightspeed-inventory'

// Australian WMS
import { DatapelAdapter } from '../adapters/datapel'

// Oracle WMS Cloud
import { OracleWmsAdapter } from '../adapters/oracle-wms'

// Retail POS / multi-channel inventory
import { IqmetrixAdapter } from '../adapters/iqmetrix'

// Revel Systems POS inventory
import { RevelSystemsAdapter } from '../adapters/revel-systems'

// SYSPRO ERP (OData 4.0, Basic auth)
import { SysproAdapter } from '../adapters/syspro'

// F&B multi-branch inventory and procurement
import { SupyAdapter } from '../adapters/supy'
import { ThreePlCentralAdapter } from '../adapters/3plcentral'
import { AcctivateAdapter } from '../adapters/acctivate'
import { AdvanceProAdapter } from '../adapters/advance-pro'
import { AgilironAdapter } from '../adapters/agiliron'
import { ApicbaseAdapter } from '../adapters/apicbase'
import { AssetPandaAdapter } from '../adapters/asset-panda'
import { BillbeeAdapter } from '../adapters/billbee'
import { BlingAdapter } from '../adapters/bling'
import { BlueYonderAdapter } from '../adapters/blue-yonder'
import { BooqableAdapter } from '../adapters/booqable'
import { BoxstormAdapter } from '../adapters/boxstorm'
import { Camelot3plAdapter } from '../adapters/camelot-3pl'
import { ChanneladvisorAdapter } from '../adapters/channeladvisor'
import { CheqroomAdapter } from '../adapters/cheqroom'
import { ConnectposAdapter } from '../adapters/connectpos'
import { CrunchtimeAdapter } from '../adapters/crunchtime'
import { DaVinciUnifiedAdapter } from '../adapters/da-vinci-unified'
import { DeckCommerceAdapter } from '../adapters/deck-commerce'
import { DeposcoAdapter } from '../adapters/deposco'
import { E2openAdapter } from '../adapters/e2open'
import { EasyEcomAdapter } from '../adapters/easyecom'
import { EccangAdapter } from '../adapters/eccang'
import { EpicorKineticAdapter } from '../adapters/epicor-kinetic'
import { ErpagAdapter } from '../adapters/erpag'
import { ErplainAdapter } from '../adapters/erplain'
import { ExtensivOrderManagerAdapter } from '../adapters/extensiv-order-manager'
import { EZOfficeInventoryAdapter } from '../adapters/ezofficeinventory'
import { FluentCommerceAdapter } from '../adapters/fluent-commerce'
import { FulfilIoAdapter } from '../adapters/fulfil-io'
import { GocodesAdapter } from '../adapters/gocodes'
import { IncreffAdapter } from '../adapters/increff'
import { InforWmsAdapter } from '../adapters/infor-wms'
import { InventoryPlannerAdapter } from '../adapters/inventory-planner'
import { InventreeAdapter } from '../adapters/inventree'
import { ItemitAdapter } from '../adapters/itemit'
import { JubelioAdapter } from '../adapters/jubelio'
import { KinaxisAdapter } from '../adapters/kinaxis'
import { KladanaAdapter } from '../adapters/kladana'
import { KoronaPosAdapter } from '../adapters/korona-pos'
import { ListingMirrorAdapter } from '../adapters/listing-mirror'
import { MabangErpAdapter } from '../adapters/mabang-erp'
import { ManhattanActiveAdapter } from '../adapters/manhattan-active'
import { MarketmanAdapter } from '../adapters/marketman'
import { MintsoftAdapter } from '../adapters/mintsoft'
import { NetstockAdapter } from '../adapters/netstock'
import { OngoingWmsAdapter } from '../adapters/ongoing-wms'
import { OpenboxesAdapter } from '../adapters/openboxes'
import { OrcaScanAdapter } from '../adapters/orca-scan'
import { OrderbotAdapter } from '../adapters/orderbot'
import { OrderfulAdapter } from '../adapters/orderful'
import { PeoplevoxAdapter } from '../adapters/peoplevox'
import { PickwareAdapter } from '../adapters/pickware'
import { PicqerAdapter } from '../adapters/picqer'
import { Pipe17Adapter } from '../adapters/pipe17'
import { PredikoAdapter } from '../adapters/prediko'
import { PulpoWmsAdapter } from '../adapters/pulpo-wms'
import { QoblexAdapter } from '../adapters/qoblex'
import { Restaurant365Adapter } from '../adapters/restaurant365'
import { SageX3InventoryAdapter } from '../adapters/sage-x3-inventory'
import { SapEwmAdapter } from '../adapters/sap-ewm'
import { SapInventoryAdapter } from '../adapters/sap-inventory'
import { SellbriteAdapter } from '../adapters/sellbrite'
import { SellercloudAdapter } from '../adapters/sellercloud'
import { ShelfNuAdapter } from '../adapters/shelf-nu'
import { ShipedgeAdapter } from '../adapters/shipedge'
import { SkulabsAdapter } from '../adapters/skulabs'
import { SkuNexusAdapter } from '../adapters/skunexus'
import { SkusavvyAdapter } from '../adapters/skusavvy'
import { SnipeItAdapter } from '../adapters/snipe-it'
import { SosInventoryAdapter } from '../adapters/sos-inventory'
import { SpherewmsAdapter } from '../adapters/spherewms'
import { SpsCommerceAdapter } from '../adapters/sps-commerce'
import { StocktrimAdapter } from '../adapters/stocktrim'
import { StoreFeederAdapter } from '../adapters/store-feeder'
import { SumtrackerAdapter } from '../adapters/sumtracker'
import { TecsysAdapter } from '../adapters/tecsys'
import { TexadaAdapter } from '../adapters/texada'
import { TinyErpAdapter } from '../adapters/tiny-erp'
import { TruecommerceAdapter } from '../adapters/truecommerce'
import { UnicommerceAdapter } from '../adapters/unicommerce'
import { VarioSoftwareAdapter } from '../adapters/vario-software'
import { VendPosAdapter } from '../adapters/vend-pos'
import { VersaCloudErpAdapter } from '../adapters/versa-cloud-erp'
import { VhsysAdapter } from '../adapters/vhsys'
import { WaspBarcodeAdapter } from '../adapters/wasp-barcode'
import { WebgilityAdapter } from '../adapters/webgility'
import { XentralAdapter } from '../adapters/xentral'

function factory<T extends InventoryAdapter>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Ctor: new (...args: any[]) => T,
): AdapterFactory<T> {
  return (cfg) => new Ctor(cfg)
}

export const ADAPTER_FACTORIES: Record<string, AdapterFactory<InventoryAdapter>> = {
  'cin7-core': factory(Cin7CoreAdapter),
  linnworks: factory(LinnworksAdapter),
  'zoho-inventory': factory(ZohoInventoryAdapter),
  'netsuite-inventory': factory(NetSuiteInventoryAdapter),
  unleashed: factory(UnleashedAdapter),
  'cin7-omni': factory(Cin7OmniAdapter),
  brightpearl: factory(BrightpearlAdapter),
  veeqo: factory(VeeqoAdapter),
  katana: factory(KatanaAdapter),
  inflow: factory(InflowAdapter),
  fishbowl: factory(FishbowlAdapter),
  'finale-inventory': factory(FinaleInventoryAdapter),
  sortly: factory(SortlyAdapter),
  skuvault: factory(SkuVaultAdapter),
  ordoro: factory(OrdoroAdapter),
  megaventory: factory(MegaventoryAdapter),
  erply: factory(ErplyAdapter),
  'odoo-inventory': factory(OdooInventoryAdapter),
  'acumatica-inventory': factory(AcumaticaInventoryAdapter),
  'shipbob-inventory': factory(ShipBobInventoryAdapter),
  'shiphero-inventory': factory(ShipHeroInventoryAdapter),
  'logiwa-inventory': factory(LogiwaInventoryAdapter),
  'extensiv-inventory': factory(ExtensivInventoryAdapter),
  'dynamics-365-bc-inventory': factory(Dynamics365BcInventoryAdapter),
  jushuitan: factory(JushuitanAdapter),
  gofrugal: factory(GofrugalAdapter),
  'dynamics-365-scm': factory(Dynamics365ScmAdapter),
  openbravo: factory(OpenbravoAdapter),
  mrpeasy: factory(MrpeasyAdapter),
  'lightspeed-inventory': factory(LightspeedInventoryAdapter),
  datapel: factory(DatapelAdapter),
  'oracle-wms': factory(OracleWmsAdapter),
  iqmetrix: factory(IqmetrixAdapter),
  'revel-systems': factory(RevelSystemsAdapter),
  syspro: factory(SysproAdapter),
  supy: factory(SupyAdapter),
  '3plcentral': factory(ThreePlCentralAdapter),
  acctivate: factory(AcctivateAdapter),
  'advance-pro': factory(AdvanceProAdapter),
  agiliron: factory(AgilironAdapter),
  apicbase: factory(ApicbaseAdapter),
  'asset-panda': factory(AssetPandaAdapter),
  billbee: factory(BillbeeAdapter),
  bling: factory(BlingAdapter),
  'blue-yonder': factory(BlueYonderAdapter),
  booqable: factory(BooqableAdapter),
  boxstorm: factory(BoxstormAdapter),
  'camelot-3pl': factory(Camelot3plAdapter),
  channeladvisor: factory(ChanneladvisorAdapter),
  cheqroom: factory(CheqroomAdapter),
  connectpos: factory(ConnectposAdapter),
  crunchtime: factory(CrunchtimeAdapter),
  'da-vinci-unified': factory(DaVinciUnifiedAdapter),
  'deck-commerce': factory(DeckCommerceAdapter),
  deposco: factory(DeposcoAdapter),
  e2open: factory(E2openAdapter),
  easyecom: factory(EasyEcomAdapter),
  eccang: factory(EccangAdapter),
  'epicor-kinetic': factory(EpicorKineticAdapter),
  erpag: factory(ErpagAdapter),
  erplain: factory(ErplainAdapter),
  'extensiv-order-manager': factory(ExtensivOrderManagerAdapter),
  ezofficeinventory: factory(EZOfficeInventoryAdapter),
  'fluent-commerce': factory(FluentCommerceAdapter),
  'fulfil-io': factory(FulfilIoAdapter),
  gocodes: factory(GocodesAdapter),
  increff: factory(IncreffAdapter),
  'infor-wms': factory(InforWmsAdapter),
  'inventory-planner': factory(InventoryPlannerAdapter),
  inventree: factory(InventreeAdapter),
  itemit: factory(ItemitAdapter),
  jubelio: factory(JubelioAdapter),
  kinaxis: factory(KinaxisAdapter),
  kladana: factory(KladanaAdapter),
  'korona-pos': factory(KoronaPosAdapter),
  'listing-mirror': factory(ListingMirrorAdapter),
  'mabang-erp': factory(MabangErpAdapter),
  'manhattan-active': factory(ManhattanActiveAdapter),
  marketman: factory(MarketmanAdapter),
  mintsoft: factory(MintsoftAdapter),
  netstock: factory(NetstockAdapter),
  'ongoing-wms': factory(OngoingWmsAdapter),
  openboxes: factory(OpenboxesAdapter),
  'orca-scan': factory(OrcaScanAdapter),
  orderbot: factory(OrderbotAdapter),
  orderful: factory(OrderfulAdapter),
  peoplevox: factory(PeoplevoxAdapter),
  pickware: factory(PickwareAdapter),
  picqer: factory(PicqerAdapter),
  pipe17: factory(Pipe17Adapter),
  prediko: factory(PredikoAdapter),
  'pulpo-wms': factory(PulpoWmsAdapter),
  qoblex: factory(QoblexAdapter),
  restaurant365: factory(Restaurant365Adapter),
  'sage-x3-inventory': factory(SageX3InventoryAdapter),
  'sap-ewm': factory(SapEwmAdapter),
  'sap-inventory': factory(SapInventoryAdapter),
  sellbrite: factory(SellbriteAdapter),
  sellercloud: factory(SellercloudAdapter),
  'shelf-nu': factory(ShelfNuAdapter),
  shipedge: factory(ShipedgeAdapter),
  skulabs: factory(SkulabsAdapter),
  skunexus: factory(SkuNexusAdapter),
  skusavvy: factory(SkusavvyAdapter),
  'snipe-it': factory(SnipeItAdapter),
  'sos-inventory': factory(SosInventoryAdapter),
  spherewms: factory(SpherewmsAdapter),
  'sps-commerce': factory(SpsCommerceAdapter),
  stocktrim: factory(StocktrimAdapter),
  'store-feeder': factory(StoreFeederAdapter),
  sumtracker: factory(SumtrackerAdapter),
  tecsys: factory(TecsysAdapter),
  texada: factory(TexadaAdapter),
  'tiny-erp': factory(TinyErpAdapter),
  truecommerce: factory(TruecommerceAdapter),
  unicommerce: factory(UnicommerceAdapter),
  'vario-software': factory(VarioSoftwareAdapter),
  'vend-pos': factory(VendPosAdapter),
  'versa-cloud-erp': factory(VersaCloudErpAdapter),
  vhsys: factory(VhsysAdapter),
  'wasp-barcode': factory(WaspBarcodeAdapter),
  webgility: factory(WebgilityAdapter),
  xentral: factory(XentralAdapter),
}

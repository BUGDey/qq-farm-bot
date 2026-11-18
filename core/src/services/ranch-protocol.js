'use strict';
const path = require('node:path');
const protobuf = require('protobufjs');

const definitions = {
    GetAll: ['friend', 'gamepb.friendpb.FriendService'],
    TaskInfo: ['task', 'gamepb.taskpb.TaskService'],
    ClaimTaskReward: ['task', 'gamepb.taskpb.TaskService'],
    BatchClaimTaskReward: ['task', 'gamepb.taskpb.TaskService'],
    StealProduce: ['animal', 'gamepb.animalpb.AnimalService'],
    StrokeAnimal: ['animal', 'gamepb.animalpb.RanchService'],
    PutHazard: ['animal', 'gamepb.animalpb.RanchService'],
    Sell: ['itemsys', 'gamepb.itempb.ItemService'],
    BatchUse: ['itemsys', 'gamepb.itempb.ItemService'],
    InteractRecords: ['interact', 'gamepb.interactpb.InteractService'],
    GetGameFriends: ['friend', 'gamepb.friendpb.FriendService'],
    SyncAll: ['friend', 'gamepb.friendpb.FriendService'],
    EnterHomestead: ['visit', 'gamepb.visitpb.VisitService'],
    LeaveHomestead: ['visit', 'gamepb.visitpb.VisitService'],
    GetIllustratedListV2: ['illustrated', 'gamepb.illustratedpb.IllustratedService'],
    ClaimAllRewardsV2: ['illustrated', 'gamepb.illustratedpb.IllustratedService'],
    GetIllustratedLevelListV2: ['illustrated', 'gamepb.illustratedpb.IllustratedService'],
    ClearNewUnlockedFruitsV2: ['illustrated', 'gamepb.illustratedpb.IllustratedService'],
    GetRanchWeightScoreV2: ['illustrated', 'gamepb.illustratedpb.IllustratedService'],
    ClaimRanchWeightScoreRewardV2: ['illustrated', 'gamepb.illustratedpb.IllustratedService'],
    GetRanchWeightRankV2: ['illustrated', 'gamepb.illustratedpb.IllustratedService'],
    ShopProfiles: ['shop2', 'gamepb.shoppb.ShopService'],
    ShopInfo: ['shop2', 'gamepb.shoppb.ShopService'],
    BuyGoods: ['shop2', 'gamepb.shoppb.ShopService'],
    RotationShopInfo: ['shop2', 'gamepb.shoppb.ShopService'],
    RotationBuyGoods: ['shop2', 'gamepb.shoppb.ShopService'],
    RotationShopClearRedpoint: ['shop2', 'gamepb.shoppb.ShopService'],
    GetBuildingList: ['homestead', 'gamepb.homesteadpb.HomesteadService'],
    GetFacilityDetail: ['homestead', 'gamepb.homesteadpb.HomesteadService'],
    GetRanchOpTimes: ['animal', 'gamepb.animalpb.RanchService'],
    BatchGetBasicInfo: ['user', 'gamepb.userpb.UserService'],
    PlaceAnimal: ['animal', 'gamepb.animalpb.AnimalService'],
    TriggerProduce: ['animal', 'gamepb.animalpb.AnimalService'],
    FeedAnimal: ['animal', 'gamepb.animalpb.AnimalService'],
    AddFeed: ['homestead', 'gamepb.homesteadpb.FeedMachineService'],
    SubmitOrder: ['order', 'gamepb.orderpb.OrderService'],
    RefreshOrder: ['order', 'gamepb.orderpb.OrderService'],
    ActivateFacility: ['homestead', 'gamepb.homesteadpb.HomesteadService'],
    UpgradeBuilding: ['homestead', 'gamepb.homesteadpb.HomesteadService'],
    CompleteBuildingUpgrade: ['homestead', 'gamepb.homesteadpb.HomesteadService'],
    GetMainCityInfo: ['homestead', 'gamepb.homesteadpb.MainCityService'],
    BuyBuilding: ['homestead', 'gamepb.homesteadpb.MainCityService'],
    PlayerSceneLogin: ['global_scene', 'gamepb.globalscenepb.GlobalSceneService'],
    GetPlayerSceneInfo: ['global_scene', 'gamepb.globalscenepb.GlobalSceneService'],
    AllCells: ['homestead', 'gamepb.homesteadpb.HomesteadService'],
    GetRanchDetail: ['animal', 'gamepb.animalpb.AnimalService'],
    HarvestRanch: ['animal', 'gamepb.animalpb.AnimalService'],
    CleanRanch: ['animal', 'gamepb.animalpb.RanchService'],
    CleanAllRanch: ['animal', 'gamepb.animalpb.RanchService'],
    GetBag: ['itemsys', 'gamepb.itempb.ItemService'],
    GetBagTab: ['itemsys', 'gamepb.itempb.ItemService'],
    GetOrderPanel: ['order', 'gamepb.orderpb.OrderService'],
};
let cached;
function createRanchProtocol() {
    if (cached) return cached;
    const root = protobuf.parse(require('node:fs').readFileSync(path.join(__dirname, '../proto/ranch.proto'), 'utf8'), { keepCase: true }).root;
    root.resolveAll();
    const rpc = {};
    const codecs = {};
    for (const [method, [module, service]] of Object.entries(definitions)) {
        const requestType = root.lookupType(`ranchbridge.${module}_${method}Request`);
        const responseType = root.lookupType(`ranchbridge.${module}_${method}Reply`);
        rpc[method] = Object.freeze({ service, method, requestType, responseType });
        codecs[method] = {
            encode(params = {}) { return Buffer.from(requestType.encode(requestType.fromObject(params)).finish()); },
            decode(bytes) { return responseType.toObject(responseType.decode(bytes), { longs: String, defaults: true }); },
        };
    }
    cached = { root, rpc, codecs,
        encode(method, params) { if (!codecs[method]) throw new Error(`Unsupported ranch RPC: ${method}`); return codecs[method].encode(params); },
        decode(method, bytes) { if (!codecs[method]) throw new Error(`Unsupported ranch RPC: ${method}`); return codecs[method].decode(bytes); },
    };
    return cached;
}
// Numeric values come from official generated enums. Labels summarize official animal tips.
const ANIMAL_STAGE = Object.freeze({ UNKNOWN: 0, CUB: 1, GROWING: 2, PRODUCING: 3, MATURE: 4, GAIN: 5 });
const ANIMAL_STAGE_LABELS = Object.freeze({ 0: '未知', 1: '幼崽期', 2: '成长期', 3: '生产期', 4: '成熟期', 5: '可收获' });
const BUCKET_TYPE = Object.freeze({ UNKNOWN: 0, ORGANIC: 1, INORGANIC: 2 });
const ILLUSTRATED_TYPE = Object.freeze({ FARM: 1, RANCH: 101 });
const RANCH_SHOP_ID = Object.freeze({ ANIMALS: 5, SUPPLIES: 6, EXCHANGE: 7 });
const MAIN_CITY_ENTRY_TYPE = Object.freeze({ UNKNOWN: 0, SCENE: 1, UI: 2 });
const FACILITY_GOODS_STATE = Object.freeze({ UNKNOWN: 0, UNLOCKABLE: 1, LEVEL_NOT_MET: 2, MAX_REACHED: 3, CURRENCY_SHORT: 4 });
module.exports = { createRanchProtocol, ANIMAL_STAGE, ANIMAL_STAGE_LABELS, BUCKET_TYPE, ILLUSTRATED_TYPE, RANCH_SHOP_ID, MAIN_CITY_ENTRY_TYPE, FACILITY_GOODS_STATE, HARVEST_RANCH_OP: Object.freeze({ ALL: 1, SHELVES: 2, ANIMALS: 3, PICKED: 4 }) };

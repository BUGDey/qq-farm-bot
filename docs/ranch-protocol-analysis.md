# 牧场（Animal/Ranch）协议接入分析（历史归档）

> 本文记录 2026-11-16 的旧版局部协议分析，已由 404 上游 `ranch.proto` 和独立 `ranch-protocol.js` 替代，不再作为现行业务字段依据。旧表中 `FeedAnimal` 字段 2 实际为 `bucket_type`，不是数量；部分所谓 target 实际为 repeated 列表。保留本文用于追溯抓包证据，现行迁移范围见 [404 牧场迁移说明](ranch-404-migration.md)。

> 证据来源：QQ 小程序缓存 `game.js`（官方生成代码）+ Reqable HAR 经 TSDK 解密后的明文请求/响应。
> 生成时间：2026-11-16。本文只记录**已证实**的字段号/wire type；语义名带 `【推断】` 的仅表示人类可读命名，
> 不影响 wire 正确性（protobuf 线上只认字段号与 wire type）。未观测到的 RPC 不落地，见「未覆盖」。

## 结论

| 操作 | 服务 | RPC | 请求字段（号:名:类型） | 回复字段 | 证据 |
|---|---|---|---|---|---|
| 栏舍详情 | `gamepb.animalpb.AnimalService` | `GetRanchDetail` | 2:空消息（客态加 1:host_gid） | 1:ranches, 2:保留 | both |
| 幼崽入栏 | 同上 | `PlaceAnimal` | 1:target(1:ranch_inst_id,2:animal_inst_id,3:animal_id) | 1:ranches, 3:op_results | both |
| 开始生产 | 同上 | `TriggerProduce` | 空 或 2:slot_target | 1:ranches, 3:op_results | both |
| 一键收获 | 同上 | `HarvestRanch` | 2:空消息, 3:mode(int32) | 1:ranches, 5:op_results... | both(请求)/cap(回复) |
| 喂罐头桶 | 同上 | `FeedAnimal` | 1:target, 2:count(int32) | 1:ranches,2:deduct_secs,4:bucket_remain_secs,5:op_results | both |
| 使坏次数 | `gamepb.animalpb.RanchService` | `GetRanchOpTimes` | 1:空消息 | 1..n:op_result(1:op_id,2:count,4:limit) | both |
| 撸动物 | 同上 | `StrokeAnimal` | 1:host_gid, 2:slot_target | 1:ranches,2:host_gid,3/4:op_results | both |
| 一键清理 | 同上 | `CleanAllRanch` | 1:host_gid, 2:空消息 | 1:ranches, 2:op_results | both |
| 加牧草 | `gamepb.homesteadpb.FeedMachineService` | `AddFeed` | 1:instance_id, 2:add_count | 1:feed_state(1:feed_count,2:consume_rate,4:remaining_secs,7:is_owner,8:status) | both |
| 装填桶 | `gamepb.itempb.ItemService` | `BatchUse` | 1:use_msg | — | cap(请求) |
| 牧场体重分 | `gamepb.illustratedpb.IllustratedService` | `GetRanchWeightScoreV2` | 空 | 1/3:int, 4:repeated 奖励项 | both(回复) |
| 领取体重分奖励 | 同上 | `ClaimRanchWeightScoreRewardV2` | 1:tier(int32) | 1/2:repeated | cap |

## 证据

| 字段/消息 | 值 | 证据类型 | 来源 |
|---|---|---|---|
| RanchAnimal 全部 23 字段号 | 见下 | official-generated-code | mcboot/game.js decode @412986（字段名明文 + case 号） |
| Ranch 全部 8 字段号 | 1..8 | official-generated-code | mcboot/game.js decode @410055 |
| AnimalTarget / SlotTarget | 1,2 / 1,2 | official-generated-code | @407233 / @407944 |
| Mutation 8 字段 | 1..8 | official-generated-code | @417035 |
| ProduceLot 6 字段 | 1..6 | official-generated-code | @419056 |
| RanchSlot 5 字段 | 1..5 | official-generated-code | @420722 |
| OpResult 4 字段 | 1:host_gid,2:ranch_inst_id,3:op_id,4:count | official-generated-code | @438878 |
| FeedState 5 字段 | 1,2,4,7,8 | official-generated-code | @895723 |
| AddFeed 请求 4 字段 | 1..4 | official-generated-code | @897821 |
| 各 RPC 请求/回复顶层字段号 | 见上表 | historical-plaintext-capture | all-decrypted.json（5078 帧解密，errorCode=0） |
| 服务名字符串 | 见上表 | historical-plaintext-capture | 解密消息 `.service` 字段 |

**关键修正**：早期手工记录把 Animal 的 `produce_ready_at_ms` 记为 14、`grass_blocked` 记为 16，
这是错的。官方 decode @412986 明确为：`grow_ready_at_ms=10, produce_ready_at_ms=11, grass_blocked=12,
infant_ready_at_ms=14, producing=15, can_deliver=16`。与解密抓包中栏位出现的
`field 22=repeated(bytes), 24=repeated(bytes)`（对应 expected_*_sells）wire 完全吻合，交叉验证通过。

## 请求重构（wire 正确性由字段号保证）

- `GetRanchDetailRequest`（主态）：`field2` = 空子消息（wire2, len0）。
- `PlaceAnimalRequest`：`field1 = AnimalTarget{ ranch_inst_id=10001(示例栏舍类型), animal_inst_id|animal_id }`。
- `FeedAnimalRequest`：`field1 = AnimalTarget{1:10001, 2:<动物序号>}`, `field2=<数量>`（抓包值 2/1）。
- `TriggerProduceRequest`：空（一键）或 `field2 = SlotTarget{1:10001, 2:1}`。
- `HarvestRanchRequest`：`field2=空, field3=<mode>`（抓包 1；另有 4 + field4=SlotTarget 的变体）。
- `AddFeedRequest`：`field1=<机器实例ID(抓包 10002)>, field2=<数量(抓包 100)>`。
- 性质：`historical-plaintext-capture`（TSDK 解密） + `official-generated-code`（子消息字段号）。

## 交叉验证

- **HAR/WS**：5078 帧全部经 `inspect-protocol-capture.js --decrypt-requests` 解出；牧场相关 594 条，errorCode 全 0。
- **字段号一致性**：官方 decoder @412986 的字段号集合与解密响应栏位对象字段号集合逐项吻合。
- **官方文档**：`mcboot/import/26/26882256…21702.json` 内嵌《栏舍动物交互界面 功能文档》§6.2 给出 14 个 RPC 名与主/客态语义，与解密抓包服务名一致。
- **配置表**：`animal` bundle 缓存（QQ=171576763）资源清单确认独立子包存在。

## 未覆盖与风险

- **无成功抓包样本，暂不实现**：`CollectProduce` / `HarvestAnimal` / `DonateAnimal` / `StealProduce` / `CleanRanch` / `PutHazard`。官方文档有 RPC 名，但没有解密请求样本，无法确认请求字段号，按红线「不猜协议」不落地。若用户后续抓到这些操作，可补。
- **客态语义**：`host_gid>0` 为客态，官方规则「客态不回写本地家园数据」，实现时需保留该判断。
- **BatchUse（装填桶）** 走 `ItemService`，请求结构仅 1 个样本，字段语义部分推断，属低置信。
- `GetRanchWeightScoreV2` 回复含大量 repeated 奖励项，字段 4 的子结构未逐条确认。
- 本文不含任何凭据、openid、真实账号数据。

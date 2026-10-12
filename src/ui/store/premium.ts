import type { StoreActions } from './slice'
import type { PremiumFeature } from '../../momo/core'
import { entitlementActive } from '../../momo/account/entitlement'
import type { UiState } from './types'

// premium 权益判定（R2a：P3 数据层接进 store，不再是恒 false 的桩）。
// 判据是 account/entitlement.ts 的 entitlementActive 纯函数：权益条目在有效期内
// **且** 缓存足够新鲜（cachedAt 距现在 ≤ ACCOUNT_GRACE_MS = 72h 离线宽限）。
// 状态从哪来：views.tsx 的 MomoView 构造处回灌 service.account（data.json 的
// account 段，服务器权威的本地缓存）——本 slice 只读不写，退出登录 = 回灌空值。
// P4 起登录 / 刷新 / 配额扣减的服务端流程会经 service/index.ts 更新 account 段再触发
// 一次回灌（或 store action），消费方（PremiumGate / 插槽过滤）不感知实现细节。
export function createPremiumSlice(ctx: StoreActions): Pick<UiState, 'entitlements' | 'accountCachedAt' | 'premiumActive'> {
  return {
    // 未登录（account 段缺失 / 半截段）的默认态：空权益 + 从未验证成功。
    // 此时 premiumActive 对三个付费功能恒 false——免费用户行为零变化。
    entitlements: {},
    accountCachedAt: null,
    premiumActive: (feature: PremiumFeature): boolean =>
      entitlementActive(feature, ctx.get().entitlements, ctx.get().accountCachedAt, new Date()),
  }
}

// 云服务契约（R3，docs/design/architecture/data-and-storage.md）：
// 客户端仓库持有的**两仓唯一真源**（commercialization.md §8）——feature id、
// 端点、错误码、DTO 形状都在这里；服务端按钉住的 commit SHA 消费本文件，
// CI 加 drift 检查（对不上即红）。改这个文件 = 半个 ADR 的分量。
//
// 边界（分层红线）：本文件 **obsidian-free、零网络代码**——只有类型与常量。
// P4 的网络请求唯一入口仍是 service/index.ts（唯一允许 import obsidian 的 momo/ 模块），
// 届时 requestUrl 的响应解析以这里形状为准；entitlement 的净化与判定复用
// account/entitlement.ts 的纯函数，本文件不建第二份。

import type { PremiumFeature } from '../core'
import type { Entitlements, QuotaEntry } from '../account/entitlement'

/** API 版本：端点路径全部带此前缀（commerce §8「带版本地允许破坏」） */
export const API_VERSION = 1

/** 最小端点面（commerce §6 + §8）：登录三件 + me + 三个付费功能各一 */
export const CLOUD_ENDPOINTS = {
  /** RFC 8628 设备码流程第一步：换 userCode + 激活网址（插件侧不放任何秘密） */
  device: '/v1/auth/device',
  /** 设备码轮询：换 access / refresh token */
  token: '/v1/auth/token',
  /** 静默刷新（401 时插件自己打一次） */
  refresh: '/v1/auth/refresh',
  /** 当前身份 + entitlement / quota 缓存 */
  me: '/v1/me',
  /** P4 备份：单向上传、恢复显式 */
  backup: '/v1/backup',
  /** P5 广场：快照分享 */
  plaza: '/v1/plaza',
  /** P6 洞察：Agent 分析（按量配额） */
  insight: '/v1/insight',
} as const

/**
 * 错误码语义表（commercialization.md §6，键 = 插件行为，值 = HTTP 状态码）：
 * 401 token 失效 → 静默刷新一次，刷新也失败才踢回登录态；
 * 403 已登录但权益不够 → 升级页；402 要配额 / 要付费（洞察 LLM 按量）→ 「本月剩 N 次」。
 * 5xx 与网络错误**不在表里**：统一什么都不弹、走离线宽限（见 isServerFault）。
 */
export const CLOUD_ERROR = {
  tokenExpired: 401,
  notEntitled: 403,
  quotaOrPay: 402,
} as const

/** 5xx / 网络层故障：走离线宽限，不弹窗不打断（commerce §6 第 3 条） */
export function isServerFault(status: number): boolean {
  return status >= 500
}

/**
 * 付费功能 → 端点 的对应（drift guard 钉的就是这张表）：每个 premium 功能的请求
 * 打到哪个端点。PREMIUM_FEATURES 加了新功能而这里没跟进 → cloud-contract 测试红，
 * 防「客户端加了功能、服务端契约没跟上」的漂移。
 */
export const FEATURE_ENDPOINTS: Record<PremiumFeature, keyof typeof CLOUD_ENDPOINTS> = {
  'cloud.backup': 'backup',
  'plaza.share': 'plaza',
  'agent.insight': 'insight',
}

// ---- DTO 形状（最小响应面；读容忍、写规范）----

export interface DeviceAuthRequest {
  /** 每台设备一个，服务端可单独撤销（「我的设备」页） */
  deviceId: string
  /** 客户端版本（manifest.version），服务端兼容判定用 */
  clientVersion: string
}

export interface DeviceAuthResponse {
  /** 8 位用户码，用户在浏览器里输它 */
  userCode: string
  /** 激活网址（任意设备的浏览器） */
  verificationUrl: string
  /** userCode 有效期（秒，10 分钟） */
  expiresInSec: number
  /** 建议轮询间隔（秒） */
  intervalSec: number
}

export interface TokenRequest {
  deviceId: string
  userCode: string
}

export interface TokenResponse {
  accessToken: string
  refreshToken: string
  /** 服务端发的匿名 id（不是邮箱） */
  userId: string
}

/** `GET /me`：身份 + entitlement / 配额缓存（净化与判定在 account/entitlement.ts） */
export interface MeResponse {
  userId: string
  entitlements: Entitlements
  quota: Partial<Record<PremiumFeature, QuotaEntry>>
}

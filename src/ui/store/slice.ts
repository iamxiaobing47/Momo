import type { StoreApi } from 'zustand'
import type { UiState } from './types'

/**
 * slice 的通用入参：把 `create<UiState>((set, get) => ...)` 里的 `set` / `get`
 * 原样传进各 slice。
 *
 * 类型上**不**自己重写签名，而是取 `StoreApi<UiState>` 的方法类型——`setState` 有
 * 「局部合并」与「整体替换」两个重载，抄一份迟早和真正传进来的对不上。
 *
 * 这样每个 slice 都写成 `Pick<UiState, 'refresh'>` 的提供方：少一个动作、
 * 签名对不上，`index.ts` 的组合处直接编译不过。
 */
export type StoreActions = {
  get: StoreApi<UiState>['getState']
  set: StoreApi<UiState>['setState']
}

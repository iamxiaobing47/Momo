// 净化层的组合子（D1）：把「盘上这个字段是脏的怎么办」的同一副**骨架**收在一处——
// 枚举白名单 / 布尔 / 数值钳制 / 记录表 / 去重清单。
//
// 与 sanitize.ts 的分工要说清：这里只管形状，**每个字段回哪个值、为什么回它**
// 留在 sanitize.ts 的调用点（那些版本号与裁决记录是盘上契约的一部分，不许被组合子吃掉）。
//
// 两道安全闸只在这里写一遍，因为它们是「抄漏一次就出事」的那类：
// ① `__proto__` 必须显式跳过——`JSON.parse` 把它解析成**自有**键，所以它确实进得了循环，
//    而 `out['__proto__'] = v` 触发的是 Object.prototype 的 setter：记录被挂成原型，
//    `Object.keys` / `JSON.stringify` / 自愈循环都看不见它，整条登记静默消失；
// ② 条数上限——手改 / 同步写坏的盘面可能塞进成千上万条，没上限就 load→save 原样往返，
//    data.json 只增不减。
//
// obsidian-free（AGENTS.md §2.1）：与 types/ 其余模块同一条红线，整层可在 node 里单测。

/** 命中白名单才算合法。非字符串一律不算——表里只有字符串，这道闸不改变任何判定 */
export function pickEnum<T extends string>(list: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : null
}

/** 只认白名单内的枚举值，脏数据 / 旧 data.json 回 `fallback`（types 层的主流形状） */
export function enumOr<T extends string>(list: readonly T[], fallback: T): (value: unknown) => T {
  return (value: unknown): T => pickEnum(list, value) ?? fallback
}

/**
 * 只认布尔：缺键 / 手改坏 / 字符串 `"false"` / `0` 都回默认。
 * 不能省——脏值一旦穿透进内存，之后每次 persist 都会把它原样写回盘，永远不自愈。
 */
export function boolOf(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * 数值兜底：非有限数回默认，其余夹进 `[min, max]` 并按 `step` 吸合。
 *
 * `step` 只为半 px 那一档存在（0.5）。取 `k = 1/step` 再 `round(v*k)/k`，与旧写法
 * `Math.round(v*2)/2` **逐位相同**：乘 2 / 除 2 都是 2 的幂，不引入浮点差。
 * `step >= 1` 直接走整数取整，等价于旧的全部整数钳制调用点。
 */
export function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
  step = 1,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const k = step >= 1 ? 1 : Math.round(1 / step)
  return Math.min(max, Math.max(min, Math.round(value * k) / k))
}

/**
 * 记录型净化的骨架：形状闸（非对象 / 数组回空表）→ 键纪律（空键与 `__proto__`）→
 * 逐项取值（`entryOf` 返回 null 即整条丢，**不连坐**其他项）→ 条数上限。
 *
 * `entryOf` 返回 `[键, 值]` 而不是只返回值：有的表要改写键（用户手填的地点名按身份键
 * 命中旧写法），有的要整条拒收。上限按**实际收下的条数**计，脏项不占额度。
 */
export function sanitizeTable<T>(
  value: unknown,
  entryOf: (key: string, raw: unknown) => readonly [string, T] | null,
  max = Number.POSITIVE_INFINITY,
): Record<string, T> {
  const out: Record<string, T> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  let count = 0
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key || key === '__proto__') continue
    const entry = entryOf(key, raw)
    if (!entry) continue
    out[entry[0]] = entry[1]
    count += 1
    if (count >= max) break
  }
  return out
}

/**
 * 字符串清单的骨架：数组闸 → 逐项取值（null 丢）→ 按出现顺序去重 → 条数上限。
 *
 * **顺序即语义**的那些表（置顶清单的顺序就是展示顺序、顶栏分段同理）只能走这里，
 * 不能用 Set 之后再展开——去重用的是内部 Set，输出的先后与旧实现的 `push` 顺序逐项一致。
 */
export function uniqueList(
  value: unknown,
  map: (item: unknown) => string | null,
  max = Number.POSITIVE_INFINITY,
): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of value) {
    const s = map(item)
    if (s === null || seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= max) break
  }
  return out
}

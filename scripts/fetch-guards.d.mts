// fetch-guards.mjs 的类型面（scripts 层 typecheck 用，见 tsconfig.scripts.json）
// 下载前沿共享闸门：摘要 / 重定向白名单 / 流式字节上限。

/** buf → sha256 十六进制 */
export function sha256Hex(buf: Uint8Array): string

/** buf → 'sha512-<base64>'（npm integrity 形制） */
export function integrityOf(buf: Uint8Array): string

/** 手动跟随重定向：每跳主机必须在 hosts 里、最多 maxHops 跳；非 2xx 一律抛 */
export function fetchGuarded(
  url: string,
  opts: { hosts: Set<string>; maxHops?: number },
): Promise<Response>

/** 流式写盘，累计超过 capBytes 抛；返回写入总字节数 */
export function streamToFile(
  res: Response,
  file: string,
  capBytes: number,
  label?: string,
): Promise<number>

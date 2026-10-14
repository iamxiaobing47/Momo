// 首次安装播种卡的内容（2026-10-13 用户裁定）：正文 / 标签 / 地点三样。
//
// 这三样是**写进用户 vault 的落盘内容**，不是界面文案——所以它们**不住在 i18n 字典里**，
// 两条守卫各说了一半理由：
// - `scripts/lint-copy.mjs` 的口径是「界面上一句人话都不许内联」，例外是「会落盘的
//   默认值」这一类（`DEFAULT_BRAND_NAME` 先例）——本文件的三个常量按同一口径登记在
//   那张白名单里（理由写在那张表旁边）；
// - `scripts/i18n-glyph-guard.test.mts` 挡的正是「ja 字典里混进简体专用字形」：把
//   中文标签 / 地名塞进 `ja/panel.ts` 会当场红（「问候」的「问」就是日语新字体写成
//   「問」的那一类）。
//
// 三语同一张卡是用户裁决（「中英日都是 Hello World」）。将来若要按语言播种，
// 改这里 + 上面两条守卫的登记，别偷偷往 ja 字典里塞中文。
//
// `FIRST_CARD_LOCATION` 写的是**名册正名**（`沈阳`），不是写给人看的整条路径：
// 大洲 / 国家由 `locations/locRoster.ts` 派生，卡片上显示成「亚洲 · 中国 · 沈阳」
// （`locPathLabel`），星球档也才有坐标可锚。写成 `亚洲中国沈阳` 会变成一个查不到
// 归属的自填地名（没有坐标、在层级树里自成顶级节点，且各语言下都是那串中文）。

/** 卡片正文。空了也不会被清扫（标签 / 地点同样算痕迹，见 `isBlankEntry`），
 *  但空 Momo 进不了索引（`readEntry` 把它滤掉）——播种卡当然要有内容。 */
export const FIRST_CARD_CONTENT = 'Hello World'

/** frontmatter 标签（写侧过 `normalizeTags`） */
export const FIRST_CARD_TAG = '问候'

/** frontmatter 地点（名册正名，见文件头） */
export const FIRST_CARD_LOCATION = '沈阳'

/**
 * Settings page copy (views/settings).
 *
 * Several blocks are bound to enums (stats sections, sidebar toggles, card-gap
 * steps) via `Record<enum, …>`: adding an enum member without a name/description
 * fails to compile. Numeric ranges come from the types module, never re-typed.
 * 2026-10-06 trim pass: dropped three kinds of padding — self-evident restatements,
 * internal reasons and migration history, and pointers made elsewhere too. The
 * honest "what happens when you turn this off" notes stay.
 */
import type { GlobeEarth, MomoData, ViewId } from '../../types'
import { CARD_FONT_SIZE, CARD_RADIUS, CARD_TITLE_SIZE, TITLE_MAX, type UiScale, type WarmRatio } from '../../types'

/** Stats section keys (= prefs.statsSections keys) */
type StatsSectionKey = keyof MomoData['prefs']['statsSections']
/** Sidebar feature keys (= prefs.sections keys) */
type SidebarSectionKey = keyof MomoData['prefs']['sections']

export const settingsPage = {
  /** Page header */
  header: {
    title: 'Settings',
    /** Contact details at the right end of the page header (2026-10-12 user request
     *  "add my contact details to the top-right of the settings page"): two email
     *  addresses, language-neutral — identical in all three locales. Deliberately
     *  plain text, not mailto links: Obsidian's handling of mailto: clicks is
     *  unreliable (it can be resolved as a vault link), and the address text is
     *  selectable as-is. */
    contact: ['iamxiaobing47@gmail.com', '3075866853@qq.com'],
  },

  /** Per-card "reset to defaults" on complex config cards */
  cardReset: 'Reset to defaults',

  /** Stepper buttons' accessible names */
  stepper: {
    decrease: 'Decrease',
    increase: 'Increase',
  },

  /** Live previews (2026-10-01: "make every setting visual so users see the change"):
   *  each settings card ends with a preview block — settings on top, preview below,
   *  read from service.data.prefs and repainted on every change. DOM lives in
   *  src/views/settings/mock.ts, styling in styles.src/80-settings.css (.momo-set-mock-*).
   *  ①②③ Language / colour scheme / typeface have no preview: their tiles and swatches
   *  ARE the preview. The "body prewarm" card lost its preview too (2026-10-06, user
   *  request): that block drew the hover-time render rhythm, which cannot be replayed on
   *  a settings page, and the four segment labels already say how much is prewarmed.
   *  The "panel & sidebar" card lost its whole-panel thumbnail as well (2026-10-09, user
   *  request): its three rows are about the real sidebar in the main panel, which is on
   *  screen at all times — a second drawing of it only repeats what is already visible.
   *  The "stats page" card lost its group thumbnail the same day (user request): its
   *  eleven chips are about the eleven cards on the real stats page, which are on screen
   *  whenever the page is open — a row of name pills only repeats that.
   *  The "review & activity" card lost its batch / heatmap thumbnail the same day (user
   *  request): its two rows are about the real review page and the real sidebar heatmap —
   *  the batch is on screen the moment you open the review tab, and the heatmap sits in
   *  the sidebar at all times, so a second drawing only repeats them.
   *  The "avatar & name" card lost its sidebar-corner thumbnail the same day (user
   *  request): its two rows (corner icon / corner name) are about the sidebar's top-left
   *  corner itself, which is on screen at all times — drawing a second small mark only
   *  repeats it.
   *  Same copy discipline as every other domain: the sample lines live here too. */
  mock: {
    label: 'Preview',
    readOnlyTip: 'Read-only: no hover lift, and clicking the body no longer opens Obsidian.',
    /* ①②③ Language / colour scheme / typeface: the tiles and swatches ARE the preview,
       so there is nothing to draw. The head still explains why the slot is empty. */
    /* The "avatar & name" sidebar-corner preview (mark follows the icon tiles, name
       follows the input) was removed wholesale on 2026-10-09 (user request), together
       with brandMock in mock.ts and the CSS .momo-set-mock-{brand,mark,mark-img,name}:
       its two rows are about the sidebar's top-left corner itself, on screen at all
       times — a second drawing only repeats it. */
    meta: { title: 'Meta line', note: 'The highlighted strip is what you are editing.' },
    title: {
      title: 'Title line',
      /** Picked live by mock.ts from the "short first line → title" switch: with it off
       *  the line in the preview is greyed out (not promoted yet) so the size slider
       *  never looks broken. */
      on: 'This line is what a promoted title looks like; drag the size slider and it follows along.',
      off: 'Promotion is still off: this line currently merges into the body below — turn the switch on to give it a line of its own.',
    },
    size: { title: 'Two cards', note: 'Spacing only shows when two cards sit together.' },
    actions: { title: 'Action row', note: 'The read-only button ignores the three switches.' },
    /** Local sample content for previews: one note (long / short — the second card
     *  of the spacing one uses the short text), two tags, and a three-level place
     *  name (the locations thumbnail preview was removed on 2026-10-11 at user
     *  request, so `mock.loc` is retired; `geo` now only feeds the pill on a card). */
    sample: {
      title: 'An evening walk',
      body: 'Walked along the riverbank for a long time, the wind…\nThe street lamps came on one by one, stretching the shadows out.',
      bodyShort: 'The first coffee of the morning is still too hot.',
      tags: ['walk', 'city'],
      geo: { continent: 'Asia', country: 'China', place: 'Beijing' },
    },
  },

  /** Tab navigation (order matches the page order) */
  nav: {
    paths: 'File paths',
    look: 'Appearance',
    panel: 'Panel & sidebar',
    review: 'Review & activity',
    stats: 'Stats page',
    loc: 'Locations',
    tags: 'Tags',
  },

  /** Interface language (language card in the Look tab); option names are the
   *  languages' own autonyms, kept in LANG_NAMES in i18n/index.ts */
  language: {
    title: 'Language',
    name: 'Interface language',
    // 2026-10-09 user request ("settings page — Appearance, remove this text"): the
    // card header note is gone entirely. It explained how "Auto" follows Obsidian and
    // when a switch takes effect, while the row name and the "currently active" line
    // sit right there in the card (this card has no preview — same ruling as the
    // panel / review / stats headers).
    // 2026-10-11 user request: rename "Auto" → "System default" — this option does
    // not have the plugin pick a language for the user; it follows the system
    // (Obsidian) language.
    /** The "System default" option: follow Obsidian instead of pinning one language */
    auto: 'System default',
    /** Row description (computed on rerender): which language is currently active */
    current: (name: string): string => `Currently active: ${name}`,
  },

  /** ① File paths */
  paths: {
    title: 'File paths',
    /** "Actual layout" preview block */
    treeTitle: 'Actual layout',
    tree: {
      root: (dir: string): string => `${dir}/`,
      notes: (dir: string): string => `├─ ${dir}/        new entries land here`,
      attachments: (dir: string): string => `├─ ${dir}/   images pasted into the body`,
      trash: (dir: string): string => `└─ ${dir}/        deleted entries wait here`,
    },
    // 2026-10-09 user request: the card header note ("Where the four kinds of files
    // live…") is gone, and the root row's note lost its "the plugin asks about
    // migrating first" half — the dialog still opens (notesMigration.ts), the copy
    // just does not repeat it here (same ruling as the panel / review / stats cards).
    root: {
      name: (): string => 'Root path',
      desc: 'A path inside the vault; missing folders are created automatically. Changing it moves your whole notes location.',
    },
    notesDir: {
      name: (): string => 'Cards path',
      desc: (): string =>
        'Where new entries are stored; entries previously kept directly in the root are still read as usual. If any notes remain in the old place, you are asked whether to move them along.',
    },
    attachmentsDir: { name: 'Attachments folder', desc: 'Images pasted into the body are copied here.' },
    trashDir: {
      // 2026-10-09 user request: "Trash folder" → "Recycle bin path"; the row note
      // ("Entries sent here no longer appear in lists / review / the heatmap…") is
      // gone — the trash page itself says all that. The warn stays.
      name: 'Recycle bin path',
      warn: 'Must not start with “.” — Obsidian does not index hidden folders, so the trash scan would find nothing.',
    },
    /** Notice after a successful migration: only the count moved — failures go
     *  through copy.errors.notesMigrateFailed (with the rollback explanation). */
    migrated: (n: number): string => `Moved ${n} notes to the new folder`,
    /** BUG-79a: the commit was silently rewritten by write-side sanitize / conflict
     *  resolution — the inputs kept showing the user's raw value */
    revertedNotice: (name: string): string =>
      `${name}: the value is invalid (contains “..” or conflicts with another folder); reverted to the last saved value.`,
  },

  /** ② Appearance: v0.9.6 split it into cards (scheme / avatar / typography /
      card behavior); v0.9.33 split the last two again into nine region cards. */
  look: {
    cards: {
      // v0.9.16: the tail of the old copy ("The dashed card at the end builds your
      // own scheme") is gone with custom schemes, moved out of the settings page
      // into the roadmap.
      // 2026-10-09 user request ("settings page — Appearance, remove this text"):
      // the card header note is gone entirely — it restated "four schemes, click one
      // to recolor", while the four scheme cards sit right here and clicking one
      // recolors the page on the spot (same ruling as the panel / review / stats
      // headers).
      scheme: { title: 'Color scheme' },
      // 2026-10-09 user request ("remove this text"): the card header note is gone
      // entirely — it explained which face and name show up and that uploaded images
      // switch on click, while the row names and their descriptions sit right there in
      // the card (corner icon / corner name, and the tiles themselves are the preview).
      // Same ruling as the panel / review / stats headers.
      brand: { title: 'Avatar & name' },
      // v0.9.33: "Typography & spacing" (5 rows) and "Card behavior" (12 rows) were
      // split into five region cards, ordered top-to-bottom down the card's anatomy
      // (info row → title → size → actions → prewarm). One card = one region = one
      // preview, and the row order mirrors the reading order inside that preview.
      meta: { title: 'Card info row', desc: "The card's top row: where the time, character count, #tags and location each sit." },
      title: { title: 'Card title', desc: 'When the first line is short enough it is promoted to a title line — and how large that line is.' },
      size: { title: 'Card size', desc: 'How large the body text is, how round the cards are, and how much space sits between two of them.' },
      // 2026-10-09 per user request ("Settings - Look, remove this text"): the card
      // header note is gone — which top-right buttons appear on hover and how
      // read-only browsing looks is said by the four rows on this card itself.
      actions: { title: 'Card actions' },
      warm: { title: 'Body prewarm', desc: 'How much body text is rendered ahead when you hover the view buttons in the top bar.' },
    },
    colorScheme: {
      name: 'Color scheme',
      // v0.9.16: the “New scheme” tail is gone with custom schemes (see roadmap.md).
      // 2026-10-09 user request ("settings page — Appearance, remove this text"): the
      // row note "click a card to switch" is gone — clicking a card *is* the switch,
      // so the sentence restated the control. The "Current: …" line under the scheme
      // cards goes with it (its prefix plus the name and description said nothing the
      // selected card does not already show). LookTab's current element is removed.
    },
    brandIcon: {
      name: 'Corner icon',
      // 2026-10-09 user request ("remove this text"): the row note is gone entirely —
      // clicking a shape *is* the switch and uploading happens on the trailing upload
      // tile, so the sentence only restated the controls. Formats / size / count stay
      // in the formats supplement line below.
    },
    brandIconUpload: {
      /** Upload tile name (shape comes from ui/icons upload) */
      tile: 'Upload image',
      /** Image tile name (screen readers); the index is supplied by the caller */
      tileAt: (n: number): string => `Image ${n}`,
      /** The × on an image tile */
      delTile: 'Remove this image',
      /** Tile title when the file is no longer on disk */
      missing: 'This file is no longer on disk',
      /** Inline format note (weaker than desc, 11px supplement line) */
      formats: (d: { maxMB: number; max: number }): string =>
        `PNG / JPG / WebP / SVG / GIF, up to ${d.maxMB}MB each, at most ${d.max} images`,
      tooBig: (maxMB: number, actualMB: number): string =>
        `Images cannot exceed ${maxMB}MB (this one is ${actualMB}MB). The corner icon is only 30px; an oversized image buys nothing.`,
      badType: 'Only PNG / JPG / WebP / SVG / GIF images are supported.',
      maxed: (max: number): string => `At most ${max} images — remove one before uploading.`,
      failed: 'Upload failed; try another image.',
      /** BUG-80d: the tile ✕ was clicked but the file on disk survived (adapter.remove failed) */
      removeFailed: 'Failed to delete the icon file; everything kept as-is.',
      // 2026-10-09 user request ("remove this text"): the keepNote line under the tiles
      // ("Uploaded images are your data: restoring defaults never deletes them.") is
      // gone, no longer taking up a row on screen. **The ruling itself is unchanged**:
      // PREFS_DEFAULTS still leaves brandIconImages out (BUG-88), so restoring defaults
      // only clears the active slot; deleting an image for good means clicking its ×.
    },
    brandName: { name: 'Corner name' },
    brandNameDesc: (d: { max: number; fallback: string }): string =>
      `The name next to the corner icon, at most ${d.max} characters; leave empty to restore “${d.fallback}”. The empty-state hint, the review and stats page headers and the command names follow it too.`,
    tagPosition: {
      name: 'Tag position',
      // 2026-10-11 per user request ("remove this text"): the whole row description is
      // gone — the row name plus the two segments already say it, and which one you
      // moved shows on the matching chip in the preview. The old line only restated
      // that plus “review cards always keep them on the meta row”.
      meta: 'Top of card',
      bottom: 'Bottom of card',
    },
    /** Location label position (split out of “Tag position”, 2026-10-01): drives only
     *  the locations labels; independent of the #tag position above. */
    locPosition: {
      name: 'Location position',
      // 2026-10-11 per user request ("remove this text"): same — the whole row
      // description is gone (“frontmatter locations” is an implementation detail not
      // worth showing; that the two are independent is the two adjacent rows).
      meta: 'Top of card',
      bottom: 'Bottom of card',
    },
    // ---- UI fine-tuning: gap stays three steps (names bound to UiScale) ----
    cardFontSize: {
      name: 'Body text size',
      desc: `Drag the slider between ${CARD_FONT_SIZE.min}–${CARD_FONT_SIZE.max}px, default ${CARD_FONT_SIZE.default}px. Card body, review body and stats note previews follow; titles and tags do not.`,
    },
    cardRadius: {
      name: 'Card corner radius',
      desc: `Corner radius of full cards, review cards and stats note previews. Slider ${CARD_RADIUS.min}–${CARD_RADIUS.max}px, default ${CARD_RADIUS.default}px.`,
    },
    cardGap: {
      name: 'Card gap',
      desc: 'Distance between cards; every view layout changes together. Default is Standard.',
      scale: { sm: 'Compact', md: 'Standard', lg: 'Roomy' } satisfies Record<UiScale, string>,
    },
    /** Slider readout units: px for most, chars for the title length limit */
    sliderUnit: { px: 'px', chars: 'chars' },
    // ---- Card information details ----
    cardStamp: {
      name: 'Card timestamp',
      // BUG-126c: since 2026-10-01 the check is `locView === 'group'` — the location-group
      // view always appends month-day (its group header is a place name, not a date).
      // 2026-10-09 label 'Auto' → 'By view': auto is not the plugin choosing for you, it
      // **follows the view you are in** (Card.tsx `locView === 'group'` — the grid view
      // was removed on 2026-10-12, so month-day now has that single branch).
      // 'Auto' promised something smarter; 'By view' is what actually happens. Fits the
      // three-way seg budget (BUG-86: 63px per span; 'Full date' measures 52px).
      // 2026-10-11 per user request ("remove this text"): the whole desc is gone —
      // the three segment names (By view / Day / Full date) speak for themselves,
      // and the “follows the current view” behaviour lives in Card.tsx.
      // BUG-86 (2026-10-06): 'Month-day' was truncated to "Month-…" in the
      // three-way seg (text budget 63px, measured 66). Shortened to 'Day';
      // 'Full date' (52px) fits and stays. Hard limits live in the comment on
      // .momo-set-seg-text in styles.src — zh/ja got hit too (see their notes).
      auto: 'By view',
      day: 'Day',
      full: 'Full date',
    },
    showCharCount: {
      name: 'Show character count',
      // 2026-10-11 per user request ("remove this text"): the whole row description is
      // gone — it only restated where the switch lives, and the switch is on the card.
    },
    /** Visibility of the three action buttons at the card's top-right (v0.9.22).
     *  2026-10-09 per user request ("Settings - Look, remove this text"): the three
     *  row descriptions are gone (including the honest "what to use instead" note
     *  AGENTS.md §2.4 asked for) — the row name already says which button it is,
     *  and switching one off removes it from the card on the spot. */
    showCardCopy: {
      name: 'Copy body button',
    },
    showCardTag: {
      name: 'Add tag button',
    },
    showCardDelete: {
      name: 'Delete button',
    },
    warmRatio: {
      name: 'Body warm-up ratio',
      // v0.9.49 (2026-10-06): rewritten to match the real behaviour — pre-warming only
      // covers the first N entries of the list (`Math.ceil(list.length × ratio)`, see
      // useListDerivations), so "the smoother the scroll after switching" over-promised;
      // the real win is "that slice is already there, no bodies popping in one by one".
      // The cost line now also says already-rendered entries are skipped. Source of
      // truth: WarmRatio in momo/types/prefs.ts and architecture/ui.md §6.
      desc: 'Hovering a view button on the topbar (before clicking) pre-renders this share of the front of the current list; after switching, that slice is already there — no bodies popping in one by one. Hovering without clicking still pays the cost; already-rendered entries are skipped. Default is half.',
      options: {
        off: 'Off',
        quarter: '1/4',
        half: '1/2',
        full: 'All',
      } satisfies Record<WarmRatio, string>,
    },
    titleFromFirstLine: {
      name: 'Short first line as title',
      // 2026-10-11 per user request ("remove this text"): only the trailing
      // “see the limit below” pointer is dropped — that slider is the next row in the
      // same card and its readout tracks the drag live.
      desc: 'When the first line is short enough, is not list / quote block syntax, and more text follows, it shows as the title on cards and the review page.',
    },
    titleMaxChars: {
      name: 'Title length limit',
      desc: (v: number): string =>
        `A first line of at most ${v} characters becomes the title; longer lines stay body text. Slider ${TITLE_MAX.min}–${TITLE_MAX.max} characters, default ${TITLE_MAX.default}.`,
    },
    cardTitleSize: {
      name: 'Title size',
      desc: `How large the title is when “Short first line as title” is on. Drag the slider between ${CARD_TITLE_SIZE.min}–${CARD_TITLE_SIZE.max}px, default ${CARD_TITLE_SIZE.default}px. Titles only; body text is untouched.`,
    },
    readOnly: {
      name: 'Read-only browsing',
      desc: 'When on, cards no longer lift on hover and clicking the body does not open Obsidian; use the “Open in Obsidian (edit)” item in the action menu.',
    },
    /** Fonts (v0.9.16, per request “users can configure the system font and the card
     *  font separately”): one row each for the panel font and the card font; tiles
     *  preview in their own face. Four open-source fonts ship with the plugin
     *  (fonts/ + runtime @font-face), usable offline; licensing notes live in
     *  fonts/OFL-1.1.txt. 2026-10-06: the input for system-installed font names was
     *  removed per request; older on-disk values are still honored (see
     *  sanitizeFontPref), only the input is gone. */
    fonts: {
      title: 'Fonts',
      // 2026-10-11 user request "remove this line": the whole card description is
      // gone — the two row labels (panel / card) and their preview tiles already
      // say it. “Four bundled open-source faces, no system install” lives in
      // fonts/OFL-1.1.txt.
      /** Sample text on font tiles: each tile renders it in its own face.
       *  v0.9.42 (user report: “the text in the options is not fully rendered”):
       *  the old “Journal Aa 123” measured 118px at its widest against the 82px
       *  content box of the old 104px min tile, so every tile ellipsized. All three
       *  locales shortened together — **hard line**: no wider than ~84px at 14px
       *  (the 116px min tile gives a 94px content box; keep 10px slack). Enforced
       *  by scripts/shots/font-truncation.mjs. The shape stays “CJK + Latin case +
       *  figures” — CJK (where kai/sans/serif differ) plus Latin case and figures
       *  (the mono tile's selling point); drop either half and you lose a thing to
       *  look at.
       *  2026-10-09 (request: sample text becomes “我爱你Abc123”): all three locales
       *  now share **one** sample string — the sample is a type specimen, not UI copy,
       *  so unifying it removes a drift surface. The hard line restated: the 94px
       *  content box is the wall (past it you get ellipsis); the “~84px / 10px slack”
       *  above was the slack target of its time, not the box boundary. Real widths of
       *  the new string, from the advance widths of the four bundled ttf at 14px:
       *  LXGW WenKai 92.3 / Noto Sans SC 87.1 / Noto Serif SC 89.9, JetBrains Mono
       *  50.4 (Latin) + 42 (three CJK via system fallback, 1em each) = 92.4 — all
       *  inside 94px, but the tightest one keeps **1.6px only**, the same magnitude
       *  as the “JetBrains Mono” name thin edge noted in BUG-87. More slack means
       *  touching the type size or the gap, which conflicts with “five tiles in one
       *  row” — leave it for the next pass on the font set. */
      sample: '我爱你Abc123',
      /** The “Default” tile: no font variable injected (panel follows the theme stack, cards follow the panel) */
      defaultTile: 'Default',
      uiFont: {
        name: 'System font',
        // 2026-10-09 user request ("settings page — Appearance"): shortened — the
        // "buttons and inputs keep the system font" half is gone, since the tiles
        // *are* the preview and buttons / inputs are outside this row's scope.
        desc: 'The face for panel text (sidebar, group headers, popovers and this settings page).',
      },
      cardFont: {
        name: 'Card font',
        // Same pass: the "Default follows the panel font" half is gone — the
        // "Default" tile sits in that very row and speaks for itself.
        desc: 'The face for card bodies and titles.',
      },
    },
  },

  /** ③ Panel & sidebar */
  panel: {
    title: 'Panel & sidebar',
    // 2026-10-09, at the user's request ("面板与侧栏页面，去掉这个文字"): the card
    // header description is removed entirely. That one sentence named what the page's
    // two cards cover (which side the sidebar docks, how wide it is, which features it
    // shows; plus the topbar views card's toggles and order) — but the row names and
    // their own descriptions sit right here in the page (sidebarSide / sidebarWidth /
    // the sidebar feature toggles / the views card each carry a desc). Same rule as
    // "no preview". The card header is the title alone.
    sidebarSide: {
      name: 'Sidebar side',
      desc: 'Which side of the main area the feature sidebar (overview / heatmap / menu / tags) docks to.',
      left: 'Left (default)',
      right: 'Right',
    },
    sidebarWidth: { name: 'Sidebar width' },
    sidebarWidthDesc: (defaultPx: number): string =>
      `You can also drag the divider between the sidebar and the main area; double-click it to restore the default ${defaultPx}px.`,
    /** Sidebar feature toggles block */
    sidebarBlock: {
      title: 'Sidebar features',
      note: 'Turning one off hides it from the sidebar; data is untouched and it can be re-enabled any time.',
    },
    /** Sidebar feature toggles: keys = prefs.sections keys (Record → missing one fails to compile).
     *  Entry order = render order = the sidebar's top-to-bottom visual order
     *  (same as SIDEBAR_TOGGLE_KEYS; drift on one side is caught by the settings-page test).
     *  2026-10-11 (user: "remove this text"): the seven row descriptions were dropped —
     *  the name already says what the switch does. No desc keys in the dict, no
     *  .momo-set-desc rendered in the grid. */
    sidebarToggle: {
      quickStats: { name: 'Sidebar numbers' },
      heatmap: { name: 'Activity heatmap' },
      // BUG-126a: the old copy promised a “Random review” command that was deleted
      // (see the header comment in src/views/commands.ts); the sidebar entry gated by
      // this switch is the only way in.
      review: { name: 'Menu · Random review' },
      stats: { name: 'Menu · Stats page' },
      trash: { name: 'Menu · Trash' },
      locations: { name: 'Location area' },
      tags: { name: 'Tag area' },
    } satisfies Record<SidebarSectionKey, { name: string }>,
    /** View-segment switches and ordering (v0.9.17) — its own card since v0.9.33:
     *  the topbar row is a separate area, so it gets its own preview.
     *  2026-10-06 renamed "Topbar views" → "Views" (user request): the whole page is
     *  already about the topbar, so the extra word only adds length to the card head. */
    viewsCard: {
      title: 'Views',
      desc: 'Which view buttons the topbar keeps and in what order.',
      /** Title of the switch when it is the last view left on (disabled) */
      /** Title on a switch that is disabled because it is the last density still
       *  on. Since 2026-10-09 the two location views joined this set, so the
       *  floor moved from "at least one view" to "at least one density": you can
       *  enter globe / group but only a density button gets you back out. */
      lastOne:
        'Keep at least one of List / Focus on — enable another one before switching this off.',
    },
    /** Per-view name (keys = ViewId, same as prefs.densityViews).
     *  Record → adding a view without a name fails to compile. Since 2026-10-09
     *  the densities and the two location views share one set (the latter used to
     *  be hard-coded in the topbar segmented control, so this card could not list
     *  them); since 2026-10-12 the grid view is gone, leaving four.
     *  2026-10-11 (user: "remove this text"): the row descriptions were
     *  dropped; entries keep only name (same as the sidebar feature toggles). */
    viewToggle: {
      list: { name: 'List' },
      focus: { name: 'Focus' },
      globe: { name: 'Globe' },
      group: { name: 'Place groups' },
    } satisfies Record<ViewId, { name: string }>,
    /** Screen-reader names for the reorder buttons: `Move List up` */
    viewMove: {
      up: (name: string): string => `Move ${name} up`,
      down: (name: string): string => `Move ${name} down`,
    },
  },

  /** ④ Review & activity */
  review: {
    title: 'Review & activity',
    // 2026-10-09, at the user's request ("回顾与活跃度页面，去掉这个文字"): the card
    // header description is removed entirely. That one sentence named what each of the
    // two rows controls (batch size / heatmap months) — but the row names sit right here
    // in the card, and the review page and sidebar heatmap are always on screen. Same
    // rule as "no preview". The card header is the title alone. On 2026-10-11 the user
    // asked to remove "this text" again, so both row descriptions are now gone too (see
    // the two comments below); the card keeps only the row names and their controls.
    reviewCount: { name: 'Entries per review batch' },
    /** Control-side hint: `1–50 entries` (the range's only home; the former row
     *  description "Default 10; takes effect on the next batch…" was removed on
     *  2026-10-11 at the user's request) */
    reviewCountHint: (d: { min: number; max: number }): string => `${d.min}–${d.max} entries`,
    heatmapMonths: { name: 'Heatmap months' },
    /** Slider readout: `6 months` (the former row description "Counts back in
     *  calendar months… default 3" was removed on 2026-10-11 at the user's request;
     *  the current value is echoed only here) */
    heatmapMonthsValue: (months: number): string => `${months} months`,
  },

  /** ⑤ Stats page */
  stats: {
    title: 'Stats page',
    // 2026-10-09, at the user's request ("统计页面，去掉这个文字"): the card header
    // description is removed entirely. That sentence described the page layout (N groups
    // + the key-figures row + per-card toggles) — but the groups sit right here in this
    // card, groupAllOn / groupSomeOff already count them, and the real stats page is
    // always on screen. Same rule as "no preview": a line that only repeats what lives
    // elsewhere goes. The card header is the title alone.
    /** Group count: `6 cards · all on by default` */
    groupAllOn: (total: number): string => `${total} cards · all on by default`,
    /** Group count: `6 cards · Content quality and others off` */
    groupSomeOff: (d: { total: number; names: string; more: boolean }): string =>
      `${d.total} cards · ${d.names}${d.more ? ' and others' : ''} off`,
    /** Per-card names and descriptions (chip text and title) */
    section: {
      kpi: { name: 'Key figures row', desc: 'Total notes (with cumulative trend) / tags (per note) / active days (with a 30-day activity ring).' },
      quality: { name: 'Content quality', desc: 'Average length / median length / long-note ratio / untagged.' },
      heatmap: {
        name: 'Activity calendar',
        desc: 'A full-year heatmap with year paging; click a cell to filter the list by date. With a single year the paging arrows hide themselves.',
      },
      trend: {
        name: 'Trend row',
        desc: '“Recording trend” and “Recording time” switch together: the former by week under 60 days, otherwise by month (all-time scope); the latter by hour / weekday distribution.',
      },
      habits: {
        name: 'Habits & milestones',
        desc: '“Recording habits” and “Milestones” switch together: streaks / new this month / per-active-day / single-day concentration + milestone progress.',
      },
      tags: { name: 'Tag lifecycle', desc: 'New / cold tags + one-off tags and concentration.' },
      // Shape follows zh's `(brand) => string` with a zero-arg closure: en copy
      // names no brand here (nobody consumes section desc today anyway).
      tagDist: { name: 'Tags per note', desc: (): string => 'How many entries carry 0 / 1 / 2 / 3+ tags.' },
      // BUG-126e: bin count / Top N come in as a param (the guard passes
      // CHAR_BIN_UPPER.length + 1 / STATS_LONGEST_TOP / STATS_LOC_RANK_TOP).
      // No hard-coded "five bins", "Top 3", "Top 10" in the dict.
      lengthDist: { name: 'Length distribution', desc: (n: number): string => `Body length in ${n} bins.` },
      records: { name: 'Longest notes', desc: (n: number): string => `Top ${n} longest; click to open in Obsidian.` },
      reviewCoverage: {
        name: 'Review',
        desc: 'Reviews over the last 7 / 30 days, longest unreviewed + reviewed / not reviewed / coverage.',
      },
      attachments: {
        name: 'Attachments',
        desc: (): string => 'Share of notes with images, total attachment count / size trend.',
      },
      locScale: {
        name: 'Footprint',
        desc: 'Distinct locations / countries / continents / per note + share without any location, plus entries by continent.',
      },
      // BUG-126e: same — Top N comes in as a param (STATS_LOC_RANK_TOP)
      locRank: { name: 'Top locations', desc: (n: number): string => `Top ${n} places; click a row to return to All notes filtered by that place.` },
      locDist: {
        name: 'Locations per note',
        desc: (): string => 'How many entries carry 0 / 1 / 2 / 3+ locations.',
      },
      locLifecycle: {
        name: 'Location lifecycle',
        desc: 'New / cold / recently visited places + one-off locations and Top 3 concentration (all-library).',
      },
    } satisfies Record<StatsSectionKey, { name: string; desc: string | ((brand: string) => string) | ((n: number) => string) }>,
  },

  /** ⑥ Locations — the coordinate manager behind the F7 globe view, plus the
   *  v0.9.30 continent / country that drive the grouped flow */
  loc: {
    title: 'Locations',
    /** Whether new notes carry an empty `locations` field (v0.9.28) */
    newNoteLocations: {
      name: 'Give new notes a locations field',
      desc: 'On = new notes carry locations: [] in their frontmatter — fill them in from Obsidian’s properties panel. Existing notes are untouched.',
    },
    /** How the sidebar “All locations” tree expands (2026-10-01). Segment labels
     *  stay short; the row description was removed on 2026-10-11 at user request. */
    treeExpand: {
      name: 'Location tree expansion',
      all: 'All open',
      fold: 'Collapsible',
    },
    /** Globe appearance (2026-10-05: “a night earth and a day earth with globe.html’s lighting”).
     *  Texture and lighting switch together; the row description was removed on
     *  2026-10-11 at user request (the reasoning lives in ui/globe/globeLight.ts). */
    earth: {
      name: 'Globe appearance',
      option: {
        night: 'Night earth',
        day: 'Day earth',
      } satisfies Record<GlobeEarth, string>,
    },
    /** Globe asset pack (v1.0.0): the 3D globe renderer and two sets of Earth textures
     *  are an optional download — the store installer and BRAT only ship the three core
     *  files. This is the plugin's only network access, and only on an explicit click. */
    pack: {
      name: 'Globe asset pack',
      desc: 'The 3D globe renderer and two sets of Earth textures (~7MB) are not shipped with the plugin — “Download” fetches them from this repo’s release. It is the plugin’s only network access.',
      download: 'Download',
      downloading: (done: number, total: number): string => `Downloading ${done}/${total}…`,
      notInstalled: 'Not installed — the globe view falls back to a simpler rendering (dots still work).',
      stale: 'The plugin was updated and the pack is from an older version — please re-download.',
      installed: 'Installed.',
      failed: (n: number): string => `Download failed (${n} files) — check your network and retry.`,
    },
    /** Block one: add a coordinate by hand (name is free — need not be in use) */
    /** Block one: locations & coordinates (live from listEntries + manual-only, by
     *  note count desc). The “add coordinates by hand” block above it was removed on
     *  2026-10-11 at user request — the row-level fill in / edit / remove below is the
     *  only way in, and every location someone wants to place is already in this table.
     *  Retired with it: addBlock / addName / addNamePh / add / nameErr / tooLongErr /
     *  dupErr / regionAddBlock / regionEmptyErr / regionDupErr. */
    useBlock: {
      title: 'Locations & coordinates',
      // The block-head note (“sorted by note count; locations with no notes yet come
      // last”) and the two footnotes underneath (precision + “reset all keeps it”) were
      // removed verbatim on 2026-10-11 at user request — same as the coordinate side,
      // the block is now title-only. Ordering and listing manual-only rows are unchanged.
    },
    /** Row: count suffix (`12 notes`) / no coordinates / the two source tags */
    count: (n: number): string => `${n} notes`,
    coordNone: 'No coordinates',
    srcBuiltin: 'Built-in',
    srcCustom: 'Manual',
    /** Row actions: fill in (none) / edit / remove (falls back to built-in or none) */
    fill: 'Fill in',
    edit: 'Edit',
    remove: 'Remove',
    save: 'Save',
    cancel: 'Cancel',
    /** When no location has ever been used */
    empty: 'No note has used a location yet. Write locations in frontmatter to manage its coordinates here.',
    /** Validation (the row editor; the add block’s wording went with it) */
    rangeErr: 'Latitude −90 to 90, longitude −180 to 180',
    /** The continent / country fields: same cap as a location name (they show up in group headers, the tree and pills) */
    regionTooLongErr: (n: number): string => `Continent and country are at most ${n} characters`,
    /** aria names + placeholders of the two fields in the **row** editor */
    addLat: 'Latitude',
    addLon: 'Longitude',
    addContinent: 'Continent',
    addCountry: 'Country',
    addContinentPh: 'e.g. Asia',
    addCountryPh: 'e.g. China',

    /** ---- Block two: continents & countries (v0.9.30; the same table again, the
     *  other axis) — the “add by hand” entry went the same way on 2026-10-11 ---- */
    regionUseBlock: {
      title: 'Continents & countries',
      note: 'Sorted by note count; locations with no notes yet come last.',
    },
    /** The row’s region column: `Asia · China` / one dimmer notch / the two source tags
     *  (same reading as the coordinate column) */
    regionNone: 'Not set',
    /** Row actions: fill in (none) / edit / remove (falls back to built-in or none) */
    regionEmpty: 'No note has used a location yet. Write locations in frontmatter to manage its continent / country here.',
    /** Same value on both sides is dirty input (a country in the continent slot) — it splits one country into two group headers */
    regionSameErr: 'Continent and country cannot be the same',
  },

  /** ⑦ Tags (invalid-tag checkup; component src/views/settings/TagsTab.ts, the
   *  verdict and the fix live in momo/tagHealth.ts). One card, one action: list
   *  the tags that **contain whitespace** and strip it. Why those are “invalid”:
   *  Obsidian tags cannot contain whitespace, so
   *  `Chapter Seven　No More Crying at Funerals` in frontmatter is not recognized
   *  as a tag at all
   *  (it is just text in the properties panel) — yet the Momo sidebar still shows
   *  it and lets you click it, so the two sides stop agreeing. */
  tags: {
    title: 'Tags',
    desc: 'A tag cannot contain a space or an ideographic space: Obsidian ignores any tag that contains whitespace. This page lists every one of them; stripping the whitespace fixes them.',
    /** Block heading */
    blockTitle: 'Invalid tags',
    /** Placeholder while scanning (listEntries is async) */
    scanning: 'Checking every tag…',
    /** Summary line: `13 invalid tags · 48 notes affected` */
    summary: (d: { tags: number; notes: number }): string => `${d.tags} invalid tags · ${d.notes} notes affected`,
    /** Empty state in place of the list (the summary line stays empty) */
    empty: 'No invalid tags.',
    /** Stand-in for whitespace inside a tag name: an open box, so invisible whitespace is drawn */
    wsMark: '␣',
    /** Prefix of the “becomes” column (an arrow, not part of the sentence) */
    arrow: '→',
    /** Trailing count: `12 notes` */
    count: (n: number): string => `${n} ${n === 1 ? 'note' : 'notes'}`,
    /** A row that cannot be fixed (stripping the whitespace leaves something that is not a tag, e.g. `19 84` → `1984`) */
    unfixable: 'Not a tag once the whitespace is gone — rename it by hand',
    /** Actions: fix this one / fix them all / scan again */
    fix: 'Fix',
    fixAll: 'Fix all',
    rescan: 'Check again',
    /** Result Notice (settings page). Shown even on full success: how many tags and
     *  notes changed is an outcome the user cannot see before clicking. */
    repaired: (d: { tags: number; notes: number; failed: number }): string =>
      `Stripped whitespace from ${d.tags} ${d.tags === 1 ? 'tag' : 'tags'}, rewriting ${d.notes} ${d.notes === 1 ? 'note' : 'notes'}${d.failed > 0 ? `, ${d.failed} failed` : ''}`,
    repairedOne: (d: { tag: string; notes: number; failed: number }): string =>
      `Stripped whitespace from #${d.tag} (${d.notes} ${d.notes === 1 ? 'note' : 'notes'})${d.failed > 0 ? `, ${d.failed} failed` : ''}`,
  },
}


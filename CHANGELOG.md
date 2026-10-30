# Changelog

## 3.12.0 - 2026-10-30 - Group selected tabs shortcut (fixes #160)

- Added a customizable keyboard shortcut to group the currently selected tabs instantly (default `Ctrl+Shift+G`, `Ctrl` means `Cmd` on Mac, so `Cmd+Shift+G` works there too).
- The shortcut only fires with 2+ groupable tabs selected, so the default doesn't hijack Find Previous (`Ctrl/Cmd+Shift+G`) during normal single-tab use; it can be changed via `browser.tabs.groups.group-selected-shortcut` and toggled via `browser.tabs.groups.group-selected-shortcut-enabled`.
- Added a `Group N Selected Tabs (shortcut)` entry to the tab right-click menu, shown only for multi-selection, using the same creation path as manual grouping (rename prompt + favicon color).
- Pinned, essential, empty, and split-view tabs are skipped; a selection already forming exactly one group is a no-op.

## 3.11.1 - 2026-10-28 - Icon persistence + drag edge gaps

- Icons are no longer lost on restart. `applySavedIcons` used to look groups up once at init and skip any that hadn't restored yet; it now waits for each group (like colors do) and skips only split-view/library copies, so late-restored groups still get their icons.
- Window-synced group copies now carry ATG icon and colour state. The mirror previously copied id/label/native colour only, so other windows never saved the icon and a restart could drop it; the source icon/colour now rides along and is applied + persisted in each window.
- Dragging above the top group and into the seam between two groups now lands outside instead of snapping into a group. Gap chrome (new-tab button, separator, empty strip) maps to before the nearest group below within 48px.
- Group drag ghosts keep the group's icon (copied from the live group when the clone misses it), and expanded/Arc groups temporarily collapse for the drag so tabs travel with the header instead of staying behind; restored on dragend and never persisted.

## 3.11.0 - 2026-10-28 - Window-sync + performance pass

- Move group to Space now syncs across windows. The group is moved as a single tracked move (`gBrowser.zenHandleTabMove`), so Zen's window sync receives `TabMove` for each tab and `TabGroupMoved` for the group. Previously each tab was moved out of the group (synced) and the group and tabs were then moved back with plain DOM inserts (not synced), so other windows got loose tabs, and with several windows open the group was lost on restart (tabs restored ungrouped).
- New groups now appear in every open window. Zen's window sync tries to mirror a new plain tab group with `gBrowser.addTabGroup([])`, which Zen's patched `addTabGroup` can't do (it throws without `insertBefore` and removes empty groups), so groups never reached other windows and were lost on restart when several windows were open. ATG now replaces window sync's `on_TabGroupCreate` for plain groups only, building the group in each other window from that window's copies of the same tabs. Zen folders and split views are untouched.
- A group moved into the Space another window is showing now appears there straight away. Group visibility was only refreshed on Space switches and ATG's own actions; it's now also refreshed (debounced) on `TabMove`, `TabGroupMoved` and `TabGroupCreate`, which fire in every window when window sync mirrors a move.
- Tab order inside groups now matches across windows. Shortly after a group change made in a window, ATG lines up the order in other windows; moves that window sync applies on another window's behalf are marked and ignored, so windows never push competing orders.
- Ungrouping no longer closes tabs in other windows. Window sync replays ungroup moves against each tab's final neighbour, which in other windows is often still inside the group, then handles `TabGroupRemoved` with `removeTabGroup()`, closing every tab left inside. ATG now moves any remaining tabs out (in the source window's order) before the group is removed.
- "Add tab to group" lists each group once. `gBrowser.getAllTabGroups()` returns every window's groups, and window sync gives each window its own copy, so groups appeared once per window, and picking another window's copy made Firefox move the tab into that window. ATG now keeps this window's copy of any group it has.
- Renaming a group now shows in other windows straight away. The same alignment pass that keeps tab order in step now also copies the group name to other windows and redraws the label; previously the new name could stay hidden there until a Space switch.
- Dragging a tab group no longer makes the drag ghost slide in from the window's top-left on macOS. A non-folder `tab-group` is `display: contents`, so Zen measured it as a 0x0 box at the window origin when building the native ghost; ATG now re-anchors native's own ghost on the header row (size and cursor offset) right after Zen sets it, in the same `startTabDrag` call. Zen folders are unaffected.
- Cached the tab-group list + id map (invalidated on TabGroupCreate/Removed/Move and once per observer batch) so workspace switches and group loops no longer re-query the DOM per lookup.
- Central `requestUpdateGroupVisibility()` (rAF + 100ms trailing) replaces all ad-hoc `setTimeout(50/100/500)` visibility callers; startup's 1000/1200/1500ms scatter is now one idle sweep.
- Body observer batches mutation records to one rAF pass, skips deep scans for leaf nodes, and `waitForElm` now times out instead of leaking one body observer per missing id (plus fast paths for live groups).
- Favicon mode is cheaper and gated: hidden-workspace groups keep their replayed saved color, sampling reuses one shared 16x16 canvas with stride sampling (max 12 favicons), and concurrent runs join instead of stacking.
- Dragover hot path is rAF-throttled with a cached threshold (5s TTL) and no `querySelectorAll` fallback in the per-mousemove path.
- Bundled Tabler pack no longer builds at startup: it builds lazily on first picker open or first `resource://atg-tabler/*` restore, and `applySavedIcons` skips the pack entirely when no saved icon needs it.
- Startup polling cut: dependency wait uses `gZenWorkspaces.promiseInitialized` + slow 250ms fallback (8s cap), library and picker installs are event-driven with bounded retries.

## 3.10.0 - 2026-10-21 - Arc-mode close button size parity

- Arc-like group mode: the close (X) button now uses the same hover box as the create-folder button (20x20 with 4px padding), so both header buttons match in size.

## 3.9.2 - 2026-10-21 - Library spaces-section groups + Tabler pick fix

- Tab groups now render in Zen Library spaces-section cards (every space, not just the active one). Workspace hiding moved from the `hidden` attribute to `atg-ws-hidden` scoped to real strips in CSS, since the section skips hidden nodes when copying rows.
- Section group copies are excluded from ATG processing/tracking (no ATG buttons, menus, colors, or saved-state writes under copy ids) and never inherit workspace hiding.
- ATG group icons (with colors) are mirrored into section copies and kept in sync on icon picks and recolors.
- Fixed bundled Tabler (and upload-button) picks silently doing nothing: the pick session now settles before the picker panel hides, so the `popuphidden` fallback can no longer win the race and drop the value as a dismissal (no `.group-icon` was rendered).

## 3.9.1 - 2026-10-20 - Arc-mode icon color/size + Tabler init gate

- Arc-like group mode: the group icon now uses the same color as the group text (sidebar and Zen Library), instead of the default-mode stroke/black fill.
- Arc-like group mode: group icons render at 16x16, filling the icon box.
- Custom Tabler icons are no longer handed to groups until the bundled Tabler pack is initialized: the pack starts early at startup, saved icons wait for it, and per-icon restores/picks await their resource host (skipping with a warning if setup failed) so icons can't render broken.

## 3.9.0 - 2026-10-20 - searchable icons + custom icons (fixes #156)

- Change Icon now opens a searchable picker: Zen SVG icons filter as you type (native search only covers emojis), plus a searchable Tabler tab — zia-extended-icons' tab when that mod is installed, otherwise ATG's bundled Tabler set (icons/ in this mod, no extra mod needed).
- Added an icon-only Upload button pinned far-left of the picker header (mirrors the trash/delete button pinned far-right: Zen's share glyph, same hover; button box copied from the trash button at runtime so both match on any Zen version; Zen's empty spacer hidden while it shows). Uploads a local image (downscaled to 96px, stored on-device) and applies even if the OS file dialog dismisses the picker first.
- Added a Remove Icon context menu item; cancelling the picker keeps the existing icon, while trash/none clears it.
- Uploaded SVGs are normalized to context-fill/context-stroke on import (parsed with DOMParser; gradients and none paints preserved) and rendered with the baked icon paint (exact CSS stroke color, contrast fallback for gradients), so custom SVGs match built-in icons on every build. SVGs stored before normalization migrate on restore. Raster uploads render un-tinted.

## 3.8.0 - 2026-09-10

- Removed ATG's custom group drag ghost so Zen's native drag image owns setDragImage (fixes wrong size/offset ghost).
- Removed duplicated native drag-list getters; now relies on Zen's childGroupsAndTabs/ariaFocusableItems instead of re-implementing elementIndex bookkeeping.
- Added folder-like edge zones on group headers (top/bottom = reorder line, middle = drop-into highlight) so tabs can be placed above/below/outside groups.
- Collapsed native drag ghost container via CSS [drag-image] rule instead of JS clone surgery.

## 3.7.0 - 2026-09-04
- Removed manual context menu actions for nesting a group under another group and moving a nested group to the top level.
- Added a native drag-list compatibility bridge so Zen's tab drag/drop code can animate and target nested ATG group labels in DOM order.

## 3.6.8 - 2026-09-04

- Restored the config gate for the Arc-mode convert group to folder button.

## 3.6.7 - 2026-09-04

- Made the convert group to folder button visible only in Arc-like group mode.
- Restyled the convert button to use close-button-like image button behavior while keeping the folder icon.

## 3.6.6 - 2026-09-04

- Reworked ATG group drag previews to follow Zen folder mechanics by styling the real drag target and cloning the actual group header.
- Ensured drag previews keep the live ATG icon DOM, group name, and theme-adaptive label colors.

## 3.6.5 - 2026-09-04

- Fixed ATG group drag preview positioning by deriving the drag-image offset from the actual grab point.
- Fixed drag preview icons by using chrome/XUL image sources directly instead of relying on HTML image snapshots.
- Made drag preview text and surface colors follow the live group label/theme colors.

## 3.6.4 - 2026-09-04

- Added an ATG group drag preview with the saved/custom group icon when available and the group name.

## 3.6.3 - 2026-09-04

- Improved nested group drag/drop reliability by syncing saved parent relationships from the real DOM after Zen drag/drop moves.
- Preserved Zen's group container start marker when ATG creates or repairs group containers.
- Marked processed group labels as Zen drop targets and made tab context menu filtering use ATG's DOM-aware group list.

## 3.6.2 - 2026-09-04

- Added real DOM nested tab groups with saved parent relationships.
- Added group context menu actions for nesting under another group and moving back to the top level.
- Updated Zen Library group rendering so nested groups are shown recursively without duplicating child tabs.

## 3.6.0 - 2026-08-24

- Added Zen Library Spaces rendering for Advanced Tab Groups so tab groups no longer appear as folders.
- Matched Library group styling to ATG in default mode, including icon color, child indentation, and the group rail.
- Added Arc-like mode handling for Library groups, keeping groups open and removing the default-mode rail.
- Added color propagation so group icons and Library group mirrors use the saved ATG group color.
- Added Move to Space actions for tab groups.

# Changelog

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

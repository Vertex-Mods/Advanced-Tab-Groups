# Changelog

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

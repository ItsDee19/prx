/**
 * Global search, command palette and keyboard shortcuts (W3 search).
 * Mounted by the W3 integration agent: CommandMenuTrigger in the topbar
 * slot; CommandPalette, ShortcutsHelp and GlobalHotkeys in GlobalOverlays.
 */
export { CommandMenuTrigger, type CommandMenuTriggerProps } from "./command-menu-trigger";
export { CommandPalette, type CommandPaletteProps } from "./command-palette";
export { GlobalHotkeys, type GlobalHotkeysProps } from "./global-hotkeys";
export { ShortcutsHelp, type ShortcutsHelpProps } from "./shortcuts-help";
export { PALETTE_ACTIONS, hasPaletteAction, type PaletteAction } from "./registry";

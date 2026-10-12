"use client";

import { useEffect, useRef } from "react";
import { SHORTCUT_SEQUENCE_MS } from "@/lib/constants";

/**
 * Keyboard shortcuts without a library (SPEC.md section 20.2, W3 search).
 *
 * `keys` uses the same notation as `<Kbd>` and `SHORTCUTS`: space-separated
 * steps, "+" joins keys pressed together, "mod" is Cmd on macOS and Ctrl
 * elsewhere. Examples: "mod+k", "shift+c", "?", "/", "enter", "g h".
 *
 * Every mounted `useHotkeys` registers with one shared document listener, so
 * sequences are resolved across hooks: when "g" then "k" completes a "g k"
 * binding anywhere, a plain "k" binding in another hook does not also fire.
 * Events from text inputs, textareas, selects and contenteditable elements are
 * ignored, and so is everything while a dialog, popover or menu is open,
 * unless the binding opts in. A matched shortcut calls `preventDefault()`;
 * events whose default was already prevented are skipped.
 */

export interface HotkeyBinding {
  keys: string;
  handler: (event: KeyboardEvent) => void;
  allowInInputs?: boolean;
  allowInDialogs?: boolean;
  /**
   * Extra guard checked before the binding counts as a match. Returning false
   * leaves the event alone (no handler call, no preventDefault), e.g. Enter
   * only while a list item has focus.
   */
  when?: (event: KeyboardEvent) => boolean;
}

export interface UseHotkeysOptions {
  /** Default true. */
  enabled?: boolean;
}

interface Chord {
  key: string;
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

interface Registration {
  bindings: { current: readonly HotkeyBinding[] };
  enabled: { current: boolean };
}

const MODIFIER_KEYS = new Set(["control", "shift", "alt", "meta", "os", "altgraph", "capslock", "fn"]);
const KEY_ALIASES: Record<string, string> = {
  " ": "space",
  spacebar: "space",
  esc: "escape",
  return: "enter",
  arrowup: "up",
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
  del: "delete",
  plus: "+",
};
const NON_TEXT_INPUT_TYPES = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"]);
const OPEN_OVERLAY_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
].join(",");
/** Longest sequence kept in the buffer. */
const MAX_SEQUENCE_LENGTH = 3;

function normalizeKey(key: string): string {
  const lower = key.toLowerCase();
  return KEY_ALIASES[lower] ?? lower;
}

const parseCache = new Map<string, Chord[]>();

/** "mod+shift+k g" → one chord per step. Cached per string. */
export function parseHotkey(keys: string): Chord[] {
  const cached = parseCache.get(keys);
  if (cached) return cached;
  const steps = keys
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((step) => {
      // "+" on its own (or "mod++") is the plus key itself, not a separator.
      const parts = step === "+" ? ["+"] : step.split(/\+(?!$)/);
      const chord: Chord = { key: "", mod: false, ctrl: false, meta: false, alt: false, shift: false };
      for (const raw of parts) {
        const part = raw.toLowerCase();
        if (part === "mod") chord.mod = true;
        else if (part === "ctrl" || part === "control") chord.ctrl = true;
        else if (part === "meta" || part === "cmd" || part === "command") chord.meta = true;
        else if (part === "alt" || part === "option") chord.alt = true;
        else if (part === "shift") chord.shift = true;
        else chord.key = normalizeKey(part);
      }
      return chord;
    })
    .filter((chord) => chord.key !== "");
  parseCache.set(keys, steps);
  return steps;
}

let macPlatform: boolean | null = null;

/** True on macOS / iOS (where "mod" means Cmd). Browser only. */
export function isMacPlatform(): boolean {
  if (macPlatform !== null) return macPlatform;
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  macPlatform = /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform ?? nav.platform ?? "");
  return macPlatform;
}

/** The fields a shortcut is matched on (a DOM or React keyboard event). */
export type HotkeyEventLike = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

function chordMatches(chord: Chord, event: HotkeyEventLike): boolean {
  const key = normalizeKey(event.key);
  // Option on macOS changes the produced character ("˚" for Option+K): fall back to the physical key.
  const codeLetter = /^Key([A-Z])$/.exec(event.code)?.[1]?.toLowerCase();
  if (key !== chord.key && !(event.altKey && codeLetter === chord.key)) return false;
  const mac = isMacPlatform();
  const wantCtrl = chord.ctrl || (chord.mod && !mac);
  const wantMeta = chord.meta || (chord.mod && mac);
  if (event.ctrlKey !== wantCtrl || event.metaKey !== wantMeta || event.altKey !== chord.alt) return false;
  if (chord.shift) return event.shiftKey;
  // Letters and digits must be pressed without Shift; symbols such as "?" need it on most layouts.
  if (/^[a-z0-9]$/.test(chord.key)) return !event.shiftKey;
  return true;
}

/** True when `event` is exactly the single-step shortcut `keys` (e.g. "mod+k"). */
export function matchesHotkey(event: HotkeyEventLike, keys: string): boolean {
  const steps = parseHotkey(keys);
  return steps.length === 1 && chordMatches(steps[0], event);
}

/** Text-entry targets where single-letter shortcuts must not fire. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(target.type);
  return target.closest('[contenteditable=""],[contenteditable="true"]') !== null;
}

/** True while any Radix dialog, sheet, popover or menu is open. */
export function isOverlayOpen(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector(OPEN_OVERLAY_SELECTOR) !== null;
}

/* ------------------------- shared dispatcher ------------------------ */

const registrations = new Set<Registration>();
let buffer: { event: KeyboardEvent; at: number }[] = [];
let listening = false;

function onKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing || MODIFIER_KEYS.has(event.key.toLowerCase())) return;
  const now = event.timeStamp || performance.now();
  if (!event.repeat) {
    buffer = buffer.filter((entry) => now - entry.at <= SHORTCUT_SEQUENCE_MS).slice(-(MAX_SEQUENCE_LENGTH - 1));
    buffer.push({ event, at: now });
  }
  const recent = event.repeat ? [{ event, at: now }] : buffer;
  const editable = isEditableTarget(event.target);
  const overlay = isOverlayOpen();

  let best = 0;
  let matched: HotkeyBinding[] = [];
  for (const registration of registrations) {
    if (!registration.enabled.current) continue;
    for (const binding of registration.bindings.current) {
      if (editable && !binding.allowInInputs) continue;
      if (overlay && !binding.allowInDialogs) continue;
      const steps = parseHotkey(binding.keys);
      if (steps.length === 0 || steps.length > recent.length || steps.length < best) continue;
      const tail = recent.slice(recent.length - steps.length);
      if (!steps.every((chord, index) => chordMatches(chord, tail[index].event))) continue;
      if (binding.when && !binding.when(event)) continue;
      if (steps.length > best) {
        best = steps.length;
        matched = [];
      }
      matched.push(binding);
    }
  }
  if (matched.length === 0) return;
  event.preventDefault();
  buffer = [];
  for (const binding of matched) binding.handler(event);
}

function retainListener(): void {
  if (listening || typeof document === "undefined") return;
  document.addEventListener("keydown", onKeyDown);
  listening = true;
}

function releaseListener(): void {
  if (!listening || registrations.size > 0) return;
  document.removeEventListener("keydown", onKeyDown);
  listening = false;
  buffer = [];
}

/**
 * Registers bindings with the shared listener outside React (the hook uses
 * it too). `bindings.current` / `enabled.current` are read on every key, so
 * callers may swap them freely. Returns the unregister function.
 */
export function registerHotkeys(
  bindings: { current: readonly HotkeyBinding[] },
  enabled: { current: boolean } = { current: true },
): () => void {
  const registration: Registration = { bindings, enabled };
  registrations.add(registration);
  retainListener();
  return () => {
    registrations.delete(registration);
    releaseListener();
  };
}

/**
 * Binds `bindings` while the component is mounted. The latest bindings and
 * handlers are always used (no need to memoise them).
 */
export function useHotkeys(bindings: HotkeyBinding[], options?: UseHotkeysOptions): void {
  const bindingsRef = useRef<readonly HotkeyBinding[]>(bindings);
  const enabledRef = useRef(options?.enabled ?? true);
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    bindingsRef.current = bindings;
    enabledRef.current = enabled;
  });

  useEffect(() => registerHotkeys(bindingsRef, enabledRef), []);
}

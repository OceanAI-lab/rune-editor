// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// packages/core/src/extensions/suggestion-menus/types.ts
import type { SuggestionOptions } from "@tiptap/suggestion";
import type { PluginKey } from "@tiptap/pm/state";

export type TriggerConfig = {
  /** Trigger character(s). Single char for `/`, `:`, `@`; multi-char like `[[` requires a `matcher`. */
  char: string;
  /**
   * Custom match function. Required when `char.length > 1`.
   *
   * Receives the live session run as a second argument — the open
   * session's range in CURRENT doc coordinates (already mapped through
   * the transaction being applied by the session-run mapper plugin), or
   * `null` when no session is open — so a matcher can implement
   * session-sticky anchoring (see `slashMatcher`). Matchers that don't
   * need it (e.g. `wikiLinkMatcher`) just ignore it — the plain
   * `findSuggestionMatch` signature remains assignable.
   */
  matcher?: (
    config: Parameters<NonNullable<SuggestionOptions["findSuggestionMatch"]>>[0],
    sessionRun?: { from: number; to: number } | null,
  ) => ReturnType<NonNullable<SuggestionOptions["findSuggestionMatch"]>>;
  allow?: SuggestionOptions["allow"];
  allowSpaces?: boolean;
  /**
   * Notion-model session start: a NEW suggestion session may only open on
   * a transaction that actually INSERTED the trigger character at the
   * match anchor (i.e. the user just typed `/`, or a command like
   * `openSlashMenu` inserted it). Caret placement — clicking or arrowing
   * into a dead `/query` run left behind by an earlier session — never
   * reopens the menu. An already-open session is unaffected (query
   * keystrokes don't re-insert the anchor char).
   *
   * Off by default: `:` legitimately opens on a LATER keystroke than its
   * trigger char (`:f` — the gate would reject the `f` transaction), and
   * `[[`'s second `[` likewise lands after the anchor.
   */
  requireTypedTrigger?: boolean;
  allowedPrefixes?: string[] | null;
  startOfLine?: boolean;
  /**
   * Ghost-text shown next to the trigger while query is empty
   * (Notion-style `Type to search`). Rendered via a CSS `::after`
   * pseudo-element on the suggestion decoration; dropped as soon
   * as the user types anything after the trigger.
   */
  placeholder?: string;
  /**
   * Gate when the suggestion is actually shown. Receives the current
   * match (`query`, `range`, `text`) on every transaction. Returning
   * `false` keeps the trigger character in the doc but hides the menu.
   *
   * Useful for triggers like `:` where we want `: alone` to remain a
   * literal colon — only `:[anychar]` opens the emoji picker.
   *
   * The gate is re-evaluated on every transaction, so flipping the
   * return value back to `true` (e.g. user deleted the query then
   * retypes a character at the same `:`) reopens the menu.
   */
  shouldShow?: SuggestionOptions["shouldShow"];
};

export interface SuggestionMenusOptions {
  triggers: TriggerConfig[];
}

export type TriggerState = {
  show: boolean;
  query: string;
  range: { from: number; to: number } | null;
  getClientRect: (() => DOMRect | null) | null;
};

export type TriggerKeyHandler = (event: KeyboardEvent) => boolean;

export type TriggerStore = {
  getSnapshot(): TriggerState;
  subscribe(listener: () => void): () => void;
  /** Internal — called by the @tiptap/suggestion render() lifecycle. */
  _setState(next: TriggerState): void;
  /** Internal — the concrete @tiptap/suggestion PluginKey for imperative exit. */
  suggestionPluginKey: PluginKey | null;
  /** Controller writes to keyHandler.current on mount; plugin's onKeyDown delegates. */
  keyHandler: { current: TriggerKeyHandler | null };
  /**
   * Imperative bypass for the trigger's `shouldShow` gate. Set this to
   * the doc position where a trigger character is being inserted
   * programmatically (e.g. slash-menu → Emoji insert `:`) — the plugin's
   * wrapped `shouldShow` will permit the suggestion to open at that
   * exact position even if the user's gate would normally reject the
   * lone trigger. Cleared automatically when the suggestion session
   * exits (`onExit`), so a future occurrence of the same trigger char
   * at the same position falls back to the regular gate.
   */
  forceOpenAt: { current: number | null };
  /**
   * Notion-style once-per-trigger gate. While set to a doc position, the
   * wrapped `shouldShow` rejects any match whose `range.from` equals this
   * position — so re-editing the same `/foo` region (e.g. deleting back
   * through a space that previously ended the match, or recovering items
   * after a no-match auto-close) does NOT re-open the menu. Cleared
   * automatically by an `appendTransaction` guard once the trigger
   * character at that position is no longer present in the doc (so a
   * fresh `/` re-typed elsewhere — or at the same spot after deletion —
   * opens normally).
   *
   * Writers: explicit dismiss paths set this before exiting the suggestion
   * session. The React controller deliberately does not arm this on empty
   * results; no-match sessions stay open until the user dismisses them.
   */
  suppressedAt: { current: number | null };
  /**
   * True when `suppressedAt` was written from @tiptap/suggestion's apply
   * path and already points into the current transaction's new doc.
   * The sibling guard consumes this once so it does not map that fresh
   * position through the same transaction a second time.
   */
  suppressedAtIsCurrentDocPos: { current: boolean };
  /**
   * Live session run in CURRENT doc coordinates — the single positional
   * authority for an open session. Written by the wrapped `shouldShow` on
   * every approved match; mapped through each transaction by the
   * session-run mapper plugin BEFORE @tiptap/suggestion's own apply reads
   * it (plugin registration order = state-field apply order); cleared on
   * `onExit`. A fully-deleted run is kept COLLAPSED (to === from) by the
   * mapper rather than nulled, so the sticky matcher — not the
   * fresh-anchor scan — owns the closing transaction; `onExit` then
   * clears it. Unlike the React-facing snapshot (written on view render,
   * so unmapped and a cycle stale during apply), this ref is always
   * current for the transaction being applied.
   */
  sessionRun: { current: { from: number; to: number } | null };
};

export type FrequencyEntry = {
  count: number;
  /** Wall-clock ms (Date.now()). Used to rank recents. */
  lastUsedAt: number;
};

/** Per-trigger map: itemKey → usage stats. Lives in memory; host-owned persistence. */
export type FrequencyMap = Record<string, FrequencyEntry>;

export interface SuggestionMenusStorage {
  triggers: Record<string, TriggerStore>;
  /** Keyed by trigger char (`/`, `:`, …). Survives only as long as the editor instance. */
  frequency: Record<string, FrequencyMap>;
}

// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

export type ActiveGesture =
  | 'block-drag'
  | 'cell-drag'
  | 'resize'
  | 'column-resize'
  | 'drag-extend'
  | 'marquee'
  | 'table-select'
  | null

export interface GestureState {
  activeGesture: ActiveGesture
}

const IDLE: GestureState = { activeGesture: null }

export const gestureKey = new PluginKey<GestureState>('rune-gesture-state')

export function isGestureActive(state: EditorState): boolean {
  return gestureKey.getState(state)?.activeGesture != null
}

export const GestureStatePlugin = Extension.create({
  name: 'gestureState',

  addProseMirrorPlugins() {
    return [
      new Plugin<GestureState>({
        key: gestureKey,
        state: {
          init: () => IDLE,
          apply(tr, prev) {
            const meta = tr.getMeta(gestureKey) as GestureState | undefined
            if (meta) return meta
            return prev
          },
        },
      }),
    ]
  },
})

// ---------------------------------------------------------------------------
// Shared gesture-claim protocol
// ---------------------------------------------------------------------------
// Seven gesture implementations previously hand-copied a claim/release dance
// against gestureKey. The canonical version lives here; the gesture files are
// migrated to call claimGesture() instead of duplicating it.
// ---------------------------------------------------------------------------

/** Every non-null ActiveGesture value — usable as a claim identifier. */
export type GestureName = Exclude<ActiveGesture, null>

export interface GestureClaim {
  /** Live check: re-reads the registry; false once another gesture steals it. */
  readonly owned: boolean
  /** owned && view.editable — every doc-mutating commit must gate on this (AV-2). */
  readonly canCommit: boolean
  /** Ownership-guarded, idempotent, destroyed-view-safe. */
  release(): void
  /**
   * Ownership-guarded release that joins an existing transaction instead of
   * dispatching its own — for commit paths that must clear the registry in the
   * same tr as their doc mutation (no flicker frame). Marks the claim released;
   * the caller dispatches the tr. No-op (returns tr unchanged) if not owned.
   * The caller MUST dispatch the returned tr; failing to do so leaves the
   * registry claimed with no way to release.
   */
  releaseInto(tr: Transaction): Transaction
}

/**
 * Claim the central gesture registry. Returns null when another gesture owns
 * it or the view is destroyed. A null return means the caller MUST run its
 * full local cleanup and stop — no armed listeners may survive a refused
 * claim (GS-6, block-drag semantics).
 */
export function claimGesture(view: EditorView, gesture: GestureName): GestureClaim | null {
  // Refuse if the view has already been destroyed.
  if (view.isDestroyed) return null
  // Refuse if another gesture already owns the registry.
  if (gestureKey.getState(view.state)?.activeGesture != null) return null

  try {
    view.dispatch(view.state.tr.setMeta(gestureKey, { activeGesture: gesture }))
  } catch {
    // View was destroyed between the check above and the dispatch.
    return null
  }

  let released = false

  return {
    get owned(): boolean {
      // Re-read the live registry on every access so a steal is detected
      // immediately without requiring a separate "stale" flag update.
      return !released && gestureKey.getState(view.state)?.activeGesture === gesture
    },
    get canCommit(): boolean {
      return this.owned && view.editable
    },
    release(): void {
      if (released) return
      released = true
      // Only clear if the registry still reads us — a thief's entry must not
      // be wiped (race-safe release mirrors the pre-migration per-site guards).
      if (gestureKey.getState(view.state)?.activeGesture === gesture) {
        try {
          view.dispatch(view.state.tr.setMeta(gestureKey, { activeGesture: null }))
        } catch { /* destroyed view — no-op */ }
      }
    },
    releaseInto(tr: Transaction): Transaction {
      if (released) return tr
      // Only clear if the registry still reads us — a thief's entry must not
      // be wiped. Mirror the ownership check from release().
      if (gestureKey.getState(view.state)?.activeGesture !== gesture) return tr
      released = true
      return tr.setMeta(gestureKey, { activeGesture: null })
    },
  }
}

/** Mouseup gate (GS-2): only the primary button release ends a gesture. */
export function isPrimaryRelease(e: MouseEvent): boolean {
  return e.button === 0
}

/**
 * Lost-mouseup watchdog for mousemove handlers (GS-2): primary button no
 * longer held (alt-tab, OS dialog, browser chrome) — abort, never commit.
 */
export function primaryLost(e: MouseEvent): boolean {
  return (e.buttons & 1) === 0
}

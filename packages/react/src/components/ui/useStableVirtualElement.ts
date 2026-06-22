// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { useRef } from "react"

import type { RuneAnchor } from "../../positioning/anchors"

/** The virtual element for Radix/floating-ui, plus the render-time `rect` the
 *  hook just resolved (the same last-good snapshot `getBoundingClientRect`
 *  seeds from). A caller that needs to SIZE off the anchor — not just position —
 *  reuses `rect` instead of re-invoking its getter and forcing a second layout
 *  pass. null only before the first usable rect (when the whole ref is null). */
export type VirtualElementRef = { current: Element; rect: DOMRect }

/**
 * Radix/Floating UI's autoUpdate calls getBoundingClientRect() on scroll,
 * resize, and rAF without re-rendering React. The returned virtual element
 * therefore reads the live getter on every measurement and only falls back
 * to the last good rect when the getter is absent or returns null/origin-zero —
 * which happens during close transitions (Tiptap suggestion onExit) and
 * async repositioning.
 *
 * `contextElement` is handed to floating-ui via the virtual element so autoUpdate
 * finds the rect's REAL scroll ancestors (an inner `overflow:auto` host), not
 * just window — otherwise the popover detaches from its anchor when an inner
 * container scrolls. Pass it explicitly (when the editor DOM is in scope, e.g.
 * a shared/headless getter that mustn't be mutated), or let it ride along on a
 * `RuneAnchor` getter that already carries `.contextElement` (the producer-hook
 * path) — the explicit arg wins. See RuneAnchor's JSDoc.
 */
export function useStableVirtualElement(
  getClientRect: (() => DOMRect | null) | RuneAnchor | null,
  contextElement?: Element | null,
): VirtualElementRef | null {
  const lastRectRef = useRef<DOMRect | null>(null)
  const getterRef = useRef(getClientRect)
  getterRef.current = getClientRect

  const initial = getClientRect?.() ?? null
  if (isUsableRect(initial)) {
    lastRectRef.current = initial
  }

  if (!lastRectRef.current) return null

  const ctx =
    contextElement ?? (getClientRect as RuneAnchor | null)?.contextElement ?? undefined

  return {
    current: {
      contextElement: ctx,
      getBoundingClientRect: () => {
        const live = getterRef.current?.() ?? null
        if (isUsableRect(live)) {
          lastRectRef.current = live
        }
        return lastRectRef.current!
      },
      // A floating-ui virtual element, not a real DOM node — Radix's virtualRef
      // and floating-ui only ever read getBoundingClientRect / contextElement
      // off it, so the Element cast is the sanctioned shape mismatch.
    } as unknown as Element,
    // Render-time snapshot (non-null past the guard above), for a caller that
    // sizes off the anchor without forcing a second getter call.
    rect: lastRectRef.current!,
  }
}

function isUsableRect(rect: DOMRect | null): rect is DOMRect {
  if (!rect) return false
  return rect.width > 0 || rect.height > 0 || rect.x !== 0 || rect.y !== 0
}

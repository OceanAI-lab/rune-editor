// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Shared utilities for drag-to-reorder features (block drag, table cell drag).

/** Read a CSS variable from the editor element with a safe fallback. The
 *  drop indicator lives on document.body (so it can render outside any
 *  scrolled / overflow:hidden ancestor of the editor), which means
 *  CSS-cascade lookup of `var(--…)` does not work — we read it from the
 *  editor element directly and apply as inline style. */
export function getEditorVar(el: HTMLElement, name: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback
}

/** Resolve a CSS length string ("-28px", "-2rem", "1em", "12") to pixels,
 *  matching how CSS layout would resolve it when the same token is consumed
 *  by a real length property. `getComputedStyle().getPropertyValue('--x')`
 *  returns the substitution-stage value with units preserved — so JS code
 *  reading a shared CSS-length token must do the unit conversion itself or
 *  it will diverge from the value that CSS `calc()` sees on the same var.
 *
 *  Handles `px`, `rem`, `em`, and unitless input (treated as px). For other
 *  units, falls back to the leading numeric value so callers get a
 *  best-effort px estimate instead of `NaN`. Returns `0` for unparseable
 *  input. */
export function resolveCssLengthToPx(raw: string, el: HTMLElement): number {
  const match = /^\s*(-?\d*\.?\d+)([a-z%]*)\s*$/i.exec(raw)
  if (!match) return 0
  const num = Number.parseFloat(match[1]!)
  if (!Number.isFinite(num)) return 0
  const unit = match[2]!.toLowerCase()
  if (unit === "" || unit === "px") return num
  if (unit === "rem") {
    const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    return Number.isFinite(rootSize) ? num * rootSize : num
  }
  if (unit === "em") {
    const elSize = Number.parseFloat(getComputedStyle(el).fontSize)
    return Number.isFinite(elSize) ? num * elSize : num
  }
  return num
}

/** Create a drop-indicator line, appended to document.body.
 *  Starts hidden (display:none); callers position and show it during drag. */
export function createDragIndicator(editorDom: HTMLElement): HTMLElement {
  const el = document.createElement('div')
  el.className = 'rune-drag-indicator'
  el.style.background = getEditorVar(
    editorDom,
    '--rune-indicator-bg',
    'rgba(50, 120, 218, 0.4)',
  )
  el.style.display = 'none'
  document.body.appendChild(el)
  return el
}

/** Register the non-mouseup cancellation handlers every drag gesture needs:
 *  Escape key, pointercancel (OS steals pointer, touch promotes to scroll),
 *  and window blur (alt-tab, OS focus shift that may suppress mouseup).
 *  Returns an unregister function; call it from the same cleanup path that
 *  removes mousemove/mouseup so every teardown stays in lockstep. */
export function registerDragCancelHandlers(cleanup: () => void): () => void {
  const onCancel = () => cleanup()
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cleanup()
  }
  const onBlur = () => cleanup()
  document.addEventListener('pointercancel', onCancel)
  document.addEventListener('keydown', onKey)
  window.addEventListener('blur', onBlur)
  return () => {
    document.removeEventListener('pointercancel', onCancel)
    document.removeEventListener('keydown', onKey)
    window.removeEventListener('blur', onBlur)
  }
}


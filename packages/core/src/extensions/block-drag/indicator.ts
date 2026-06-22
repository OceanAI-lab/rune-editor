// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { createDragIndicator } from "../shared/drag-utils"

export function createIndicator(editorDom: HTMLElement): HTMLElement {
  const el = createDragIndicator(editorDom)
  el.style.position = "fixed"
  el.style.height = "2px"
  el.style.pointerEvents = "none"
  el.style.zIndex = "9999"
  return el
}

export function positionIndicator(
  indicator: HTMLElement,
  left: number,
  top: number,
  width: number,
): void {
  indicator.style.left = `${left}px`
  indicator.style.top = `${top}px`
  indicator.style.width = `${width}px`
  // Re-assert the horizontal thickness: the same element doubles as the F6
  // vertical zone bar, so a vertical frame may have stretched the height.
  indicator.style.height = "2px"
  indicator.style.display = "block"
}

/**
 * F6 vertical variant: a 2px bar at viewport X spanning `[top, top+height]`
 * — full target-block height for a wrap zone, full layout height for an
 * add-column zone. Same fixed-position element as the horizontal slot
 * indicator (gesture-ephemeral chrome; the capture-scroll refresh in
 * gesture.ts re-positions it like any other frame).
 */
export function positionIndicatorVertical(
  indicator: HTMLElement,
  x: number,
  top: number,
  height: number,
): void {
  indicator.style.left = `${x - 1}px`
  indicator.style.top = `${top}px`
  indicator.style.width = "2px"
  indicator.style.height = `${height}px`
  indicator.style.display = "block"
}

export function hideIndicator(indicator: HTMLElement): void {
  indicator.style.display = "none"
}

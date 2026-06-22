// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import {
  MAX_CONTENT_WIDTH,
  MIN_CONTENT_WIDTH,
} from "../../blocks/media/contentWidth"

export function availableContentWidth(block: HTMLElement): number {
  const style = window.getComputedStyle(block)
  const start = cssPx(style.paddingInlineStart || style.paddingLeft)
  const end = cssPx(style.paddingInlineEnd || style.paddingRight)
  return Math.max(1, block.clientWidth - start - end)
}

export function widthPercentFromPixels(
  widthPx: number,
  containerWidthPx: number,
): number {
  if (
    !Number.isFinite(widthPx) ||
    !Number.isFinite(containerWidthPx) ||
    containerWidthPx <= 0
  ) {
    return MIN_CONTENT_WIDTH
  }
  return clampResizePercent(Math.round((widthPx / containerWidthPx) * 100))
}

export function clampResizePercent(value: number): number {
  return Math.max(
    MIN_CONTENT_WIDTH,
    Math.min(MAX_CONTENT_WIDTH, Math.round(value)),
  )
}

function cssPx(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

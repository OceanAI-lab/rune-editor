// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { RuneInPlaceAttr } from "../../schema"

export const MEDIA_ALIGN_VALUES = ["left", "center", "right"] as const

export type MediaAlign = (typeof MEDIA_ALIGN_VALUES)[number]

export const DEFAULT_MEDIA_ALIGN: MediaAlign = "center"

export function isMediaAlign(value: unknown): value is MediaAlign {
  return MEDIA_ALIGN_VALUES.includes(value as MediaAlign)
}

export function normalizeMediaAlign(value: unknown): MediaAlign {
  return isMediaAlign(value) ? value : DEFAULT_MEDIA_ALIGN
}

export function inputMediaAlignOrDefault(
  value: unknown,
  fallback: unknown,
): MediaAlign {
  if (value === undefined) return normalizeMediaAlign(fallback)
  return normalizeMediaAlign(value)
}

/**
 * Attribute-level parseHTML for the `align` prop. Returns null when the
 * element carries no (valid) `data-align` so Tiptap falls through to the
 * schema default — bare `<img>` / `<video>` paste sources stay "center".
 */
export function parseMediaAlignAttr(el: HTMLElement): MediaAlign | null {
  const raw = el.getAttribute("data-align")
  return isMediaAlign(raw) ? raw : null
}

/**
 * Attribute-level renderHTML for the `align` prop. Center is the default
 * and is NOT emitted — CSS centers media without a data-attr, so legacy
 * documents (no `align`) and fresh blocks serialize identically.
 */
export function renderMediaAlignAttr(
  attrs: Record<string, unknown>,
): Record<string, string> {
  const align = attrs.align
  if (!isMediaAlign(align) || align === DEFAULT_MEDIA_ALIGN) return {}
  return { "data-align": align }
}

/**
 * In-place NodeView application for the `align` attr (live mirror of
 * `renderMediaAlignAttr`): center is the default and clears `data-align`
 * so legacy documents and fresh blocks stay DOM-identical.
 */
export const mediaAlignInPlaceAttr: RuneInPlaceAttr = {
  attr: "align",
  applyToDOM: ({ root }, value) => {
    const align = normalizeMediaAlign(value)
    if (align === DEFAULT_MEDIA_ALIGN) root.removeAttribute("data-align")
    else root.setAttribute("data-align", align)
  },
}

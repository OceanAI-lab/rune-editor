// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Normalize an incoming attr value to our stored form. Accepts either:
//   - a palette ColorName already ("gray", "blue", …) → returned verbatim
//   - any other string (raw hex, rgb(), inline CSS) → mapped through
//     nearestColorName() for the given variant (text vs background)
//   - null / empty → null
// This is the single point where "external representation" collapses to
// "ColorName | null" — all four color extensions (inline + block × text
// + background) share this function so the invariant never drifts.

import { COLOR_NAMES, type ColorName } from "./colors"
import { nearestColorName } from "./nearestColorName"

type Variant = "text" | "background"

export function normalizeAttrValue(
  raw: string | null,
  variant: Variant,
): ColorName | null {
  if (!raw) return null
  if ((COLOR_NAMES as readonly string[]).includes(raw)) return raw as ColorName
  return nearestColorName(raw, variant)
}

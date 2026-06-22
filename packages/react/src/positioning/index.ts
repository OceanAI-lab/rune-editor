// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Floating-UI positioning — the anchor computation lifted out of the AI flow so
// any surface (including a downstream host's own Popover) can anchor to an
// editor selection or block with rune's exact rect math. Pair these getters with
// `useStableVirtualElement` + `useLockedPopoverSide` (exported from the package
// root). See the floating-primitives spec.

export {
  pointAnchorAtHead,
  rangeToRect,
  rectForBlockId,
  unionBlockRect,
  editorViewDom,
} from "./anchors"
export type { RuneAnchor, PointAnchorOptions } from "./anchors"

export { useSelectionAnchor } from "./useSelectionAnchor"
export { useBlockAnchor } from "./useBlockAnchor"
export { useRangeAnchor } from "./useRangeAnchor"

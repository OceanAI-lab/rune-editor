// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

export interface SideMenuState {
  hoveredPos: number | null
}

export interface SideMenuHoveredBlock {
  pos: number
  id: string
  type: string
}

/**
 * Plain mutable property. External-store (subscribe / getSnapshot)
 * contract lands with the first React consumer — deferred until the
 * dropdown spec.
 */
export interface SideMenuStorage {
  hoveredBlock: SideMenuHoveredBlock | null
}

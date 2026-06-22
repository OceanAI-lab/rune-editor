// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

export { ColorMenu, type ColorMenuProps } from "./ColorMenu"
export { ColorIndicator, type ColorIndicatorProps } from "./ColorIndicator"
export {
  recordColorUse,
  getRecentColors,
  getColorFrequency,
  RECENT_COLORS_LIMIT,
  type RecentColor,
  type ColorKind,
} from "./recentColors"

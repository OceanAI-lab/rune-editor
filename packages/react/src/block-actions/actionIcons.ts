// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { ComponentType } from "react"
import {
  ArrowDiagonalUpRightIcon,
  DownloadIcon,
  FitWidthIcon,
  type IconProps,
  RepeatIcon,
} from "../icons"

// Maps block-action `icon` string tokens (core RuneBlockAction.icon) to
// icon components. Shared by the side-menu BlockActionsDropdown and the
// media floating bar so both surfaces render the same glyph for the same
// action. Unknown tokens render without an icon (no crash).
export const BLOCK_ACTION_ICON_MAP: Record<string, ComponentType<IconProps>> = {
  "fit-width": FitWidthIcon,
  replace: RepeatIcon,
  download: DownloadIcon,
  "external-link": ArrowDiagonalUpRightIcon,
}

export function resolveBlockActionIcon(
  token: string | undefined,
): ComponentType<IconProps> | undefined {
  return token ? BLOCK_ACTION_ICON_MAP[token] : undefined
}

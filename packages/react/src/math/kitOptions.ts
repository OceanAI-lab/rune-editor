// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { CreateRuneKitOptions } from "@ocai/rune-core"
import { inlineMathReactNodeView } from "./InlineMathNodeView"
import { equationBlockReactNodeView } from "./EquationBlockNodeView"

export function reactMathNodeViews(): NonNullable<CreateRuneKitOptions["mathNodeViews"]> {
  return {
    inlineMath: inlineMathReactNodeView,
    equationBlock: equationBlockReactNodeView,
  }
}

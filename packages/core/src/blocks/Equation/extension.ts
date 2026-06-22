// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Extension } from "@tiptap/core"
import { equationBlockCommands } from "./commands"

/**
 * Standalone command extension for equationBlock. Lives separately
 * from the block spec because `createBlockSpec` doesn't currently
 * surface an `addCommands` config slot. Registered in kit.ts
 * immediately after the Equation block extension.
 */
export const EquationBlockCommands = Extension.create({
  name: "equationBlockCommands",
  addCommands() {
    return equationBlockCommands() as ReturnType<
      typeof equationBlockCommands
    >
  },
})

// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import type { RuneBlock } from "../../blocks"
import { getDocument, walkRuneBlocks } from "./getDocument"

export function getBlockById(editor: Editor, id: string): RuneBlock | null {
  // Recurse into container blocks (column children) via the shared walker —
  // a nested body block is addressable by id just like a root one.
  let found: RuneBlock | null = null
  walkRuneBlocks(getDocument(editor), (block) => {
    if (!found && block.id === id) found = block
  })
  return found
}

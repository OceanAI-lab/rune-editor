// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import type { RuneBlock } from "../../blocks"
import { getDocument, walkRuneBlocks } from "./getDocument"

export function findBlocks(
  editor: Editor,
  predicate: (block: RuneBlock) => boolean,
): RuneBlock[] {
  // Recurse into container blocks (column children) via the shared walker so
  // a predicate matches nested body blocks too. Document order preserved.
  const out: RuneBlock[] = []
  walkRuneBlocks(getDocument(editor), (block) => {
    if (predicate(block)) out.push(block)
  })
  return out
}

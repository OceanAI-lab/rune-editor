// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// General block-API types. Per-block shapes (RuneParagraphBlock,
// RuneHeadingBlock, …) live next to their block definitions under
// blocks/<Name>/block.ts. This file is for contracts that EVERY block
// obeys — the common base and the aggregate union.

export interface RuneBlockBase {
  /** nanoid(8) assigned by the BlockId plugin. Stable across edits. */
  id: string
  /** 0-based nesting level. Adjacent blocks with depth > 0 form an
   * implicit run under the closest preceding block with smaller depth. */
  depth: number
}

// Union of all built-in blocks is assembled in blocks/index.ts so each
// block stays self-contained. Re-export for consumers who want the
// whole surface from a single path.
export type { RuneBlock } from "./blocks"

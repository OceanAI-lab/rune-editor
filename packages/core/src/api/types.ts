// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { RuneBlock } from "../blocks"

type OptionalInputCommon<T> = T extends { id: string; depth: number }
  ? Omit<T, "id" | "depth"> & { id?: string; depth?: number }
  : never

type DistributiveBlockUpdate<T> = T extends unknown
  ? Omit<Partial<T>, "id">
  : never

/**
 * Distributes over RuneBlock so adding a new block to the
 * RuneBlock union (in packages/core/src/blocks/index.ts) auto-
 * extends RuneBlockInput. No api/types.ts edit per new block.
 */
export type RuneBlockInput = OptionalInputCommon<RuneBlock>

/**
 * Address a column surface for insert: a block at a 0-based `index` within
 * the column, or appended at the column's tail. `columnId` is the column's
 * stable (`col_`-prefixed) id. Columns Phase 1 (Task 5).
 */
export type ColumnInsertTarget =
  | { columnId: string; index: number }
  | { columnId: string; at: "end" }

export type BlockInsertTarget =
  | number
  | "end"
  | { id: string; side: "before" | "after" }
  | ColumnInsertTarget

// AI-facing insert target: block-id-relative (or "end"), never a raw PM
// numeric boundary. Inherits the column-surface target so an agent can also
// place a block inside a named column.
export type BlockIdInsertTarget =
  | "end"
  | { id: string; side: "before" | "after" }
  | ColumnInsertTarget

export interface InsertBlocksOptions {
  at?: BlockInsertTarget
  depth?: number
}

export interface InsertBlocksByIdOptions {
  at?: BlockIdInsertTarget
  depth?: number
}

export type DeleteBlocksTarget = string[] | { from: string; to: string }

export type TurnIntoTarget =
  | string
  | string[]
  | { from: string; to: string }

export interface TurnIntoBlockInput {
  type: string
  props?: Record<string, unknown>
  content?: string
}

/**
 * Move destination. A root/sibling target (`{ id, side }`) places the moved
 * slice relative to a block on its surface; a column target
 * (`{ columnId, index | at:"end" }`) places it inside a named column. Columns
 * Phase 1 (Task 5) — cross-surface RANGE moves stay out of scope (rejected).
 */
export type MoveBlocksTarget =
  | { id: string; side: "before" | "after" }
  | { columnId: string; index: number }
  | { columnId: string; at: "end" }

/**
 * Drag-to-create-columns destination (columns Phase 2, F6).
 *
 * `{ id, side }` wraps the named ROOT block together with the moved run into
 * a NEW 2-column layout (both columns `width: 1`); `side` is the side the
 * MOVED run lands on ("left" → moved run becomes the left column).
 *
 * `{ layoutId, index }` inserts a NEW column at boundary `index`
 * (`0..columnCount`) of an existing layout — its width is the mean of the
 * existing column widths — and the moved run becomes its children. Refused at
 * the 5-column schema cap.
 */
export type WrapIntoColumnsTarget =
  | { id: string; side: "left" | "right" }
  | { layoutId: string; index: number }

export type BlockUpdate = DistributiveBlockUpdate<RuneBlock>

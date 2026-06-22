// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

export interface ChooseDropDepthInput {
  cursorX: number
  minLeft: number
  indentStepPx: number
  previousDepth: number | null
  previousIsStructural: boolean
}

export interface DropIndicatorLeftInput {
  minLeft: number
  indentStepPx: number
  depth: number
}

export function maxDropDepthForSlot(
  previousDepth: number | null,
  previousIsStructural: boolean,
): number {
  // Rune's factory-built blocks all carry a `depth` attr, so the drag
  // executor can shift any dragged block chain to this chosen top depth.
  if (!previousIsStructural || previousDepth == null) return 0
  return Math.max(0, previousDepth + 1)
}

export function chooseDropDepth(input: ChooseDropDepthInput): number {
  const maxDepth = maxDropDepthForSlot(input.previousDepth, input.previousIsStructural)
  if (!Number.isFinite(input.indentStepPx) || input.indentStepPx <= 0) return 0

  // Deliberately no hysteresis yet: #253 only makes depths reachable.
  // Boundary-jitter polish can add a sticky source-depth bias later.
  const rawDepth = Math.floor((input.cursorX - input.minLeft) / input.indentStepPx)
  return clamp(rawDepth, 0, maxDepth)
}

export function dropIndicatorLeftForDepth(input: DropIndicatorLeftInput): number {
  if (!Number.isFinite(input.indentStepPx) || input.indentStepPx <= 0) {
    return input.minLeft
  }
  return input.minLeft + input.depth * input.indentStepPx
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Selection } from "@tiptap/pm/state"
import { TextSelection } from "@tiptap/pm/state"

export function getCrossBlockTextRange(
  selection: Selection,
): { fromIdx: number; toIdx: number } | null {
  if (!(selection instanceof TextSelection)) return null
  const { $from, $to } = selection
  if ($from.depth < 1 || $to.depth < 1) return null
  const fromIdx = $from.index(0)
  const toIdx = $to.index(0)
  if (fromIdx === toIdx) return null
  return { fromIdx, toIdx }
}

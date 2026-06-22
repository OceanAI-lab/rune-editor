// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

export function topLevelBlockIndexById(doc: ProseMirrorNode, id: string): number {
  for (let i = 0; i < doc.childCount; i++) {
    if ((doc.child(i).attrs.id as string | null) === id) return i
  }
  return -1
}

export function topLevelBlockPosById(doc: ProseMirrorNode, id: string): number {
  let pos = 0
  for (let i = 0; i < doc.childCount; i++) {
    if ((doc.child(i).attrs.id as string | null) === id) return pos
    pos += doc.child(i).nodeSize
  }
  return -1
}

export function topLevelBlockStartPos(doc: ProseMirrorNode, index: number): number {
  let pos = 0
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize
  return pos
}

export function topLevelBlockStartPosBefore(doc: ProseMirrorNode, boundaryPos: number): number {
  const index = topLevelBlockIndexAtBoundaryPos(doc, boundaryPos)
  if (index <= 0) return -1
  return topLevelBlockStartPos(doc, index - 1)
}

export function topLevelBlockEndPos(doc: ProseMirrorNode, index: number): number {
  return topLevelBlockStartPos(doc, index) + doc.child(index).nodeSize
}

export function topLevelBlockIndexAtBoundaryPos(doc: ProseMirrorNode, pos: number): number {
  if (pos === doc.content.size) return doc.childCount
  if (pos < 0 || pos > doc.content.size) return -1

  let offset = 0
  for (let i = 0; i < doc.childCount; i++) {
    if (offset === pos) return i
    offset += doc.child(i).nodeSize
  }
  return -1
}

export function topLevelBlockTextBounds(doc: ProseMirrorNode, index: number): { from: number; to: number } {
  const from = topLevelBlockStartPos(doc, index) + 1
  return { from, to: from + doc.child(index).content.size }
}

export function topLevelBlockTextBoundsAtPos(
  doc: ProseMirrorNode,
  pos: number,
): { index: number; from: number; to: number } | null {
  let running = 0
  for (let i = 0; i < doc.childCount; i++) {
    const from = running + 1
    const to = from + doc.child(i).content.size
    if (pos >= from && pos <= to) return { index: i, from, to }
    running += doc.child(i).nodeSize
  }
  return null
}

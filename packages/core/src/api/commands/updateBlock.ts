// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import type { Schema, Node as ProseMirrorNode } from "@tiptap/pm/model"
import { resolveBodyBlockById } from "../../schema/bodySurface"
import { blockFromNode } from "../queries/getDocument"
import { createNodeFromBlockInput } from "./insertBlocks"
import type { BlockUpdate, RuneBlockInput } from "../types"

export function resolveUpdate(
  editor: Editor,
  schema: Schema,
  doc: ProseMirrorNode,
  id: string,
  partial: BlockUpdate,
): { pos: number; node: ProseMirrorNode } | null {
  if (Object.prototype.hasOwnProperty.call(partial, "id")) return null

  // Recursive resolver: a column child is addressable by id exactly like a
  // root block (it returns the child's absolute pos on its column surface).
  const resolved = resolveBodyBlockById(doc, id)
  if (!resolved) return null
  const pos = resolved.pos

  const currentNode = doc.nodeAt(pos)
  if (!currentNode) return null

  const current = blockFromNode(editor, currentNode)
  if (!current) return null

  const merged = {
    ...current,
    ...partial,
    type: partial.type ?? current.type,
    depth: partial.depth ?? current.depth,
    id: current.id,
  } as RuneBlockInput

  const node = createNodeFromBlockInput(editor, schema, merged, {
    depth: current.depth ?? 0,
    attrs: currentNode.attrs,
    content: currentNode.content,
    marks: currentNode.marks,
    preserveContent: !("text" in partial),
  })
  return node ? { pos, node } : null
}

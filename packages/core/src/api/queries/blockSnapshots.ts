// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import {
  getBlockSpecs,
  type JsonValue,
  type RuneMarkdownBlockSerializerContext,
} from "../../schema"
import { forEachBodyBlock, resolveBodyBlockById } from "../../schema/bodySurface"
import { serializeInlineContent } from "../export/serializeInline"
import {
  runeCommandError,
  runeCommandOk,
  type RuneCommandResult,
} from "../result"
import { blockFromNode } from "./getDocument"

export interface RuneBlockOutline {
  id: string
  type: string
  depth: number
  /** Index within the block's surface (surface-local, 0-based). */
  index: number
  preview: string
  /**
   * The surface the block lives on. Omitted for blocks on the root surface
   * (the doc). For a block nested inside a `column`, this is that column's
   * id — letting an outline consumer distinguish root from in-column blocks
   * without resolving positions. Public-API addition (Columns Phase 1).
   */
  surface?: string
}

export type RunePublicBlock = {
  type: string
  id: string
  depth: number
} & Record<string, JsonValue>

export interface RuneBlockSnapshot {
  block: RunePublicBlock
  markdown: string
  text: string
}

function blockPlainText(node: PMNode): string {
  return node.textContent
}

function blockPreview(text: string): string {
  return Array.from(text.trim().replace(/\s+/g, " "))
    .slice(0, 120)
    .join("")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function jsonSafePublicBlock(value: unknown): RunePublicBlock | null {
  try {
    const cloned = JSON.parse(JSON.stringify(value)) as unknown
    if (!isRecord(cloned)) return null
    if (typeof cloned.type !== "string") return null
    if (typeof cloned.id !== "string") return null
    if (typeof cloned.depth !== "number") return null
    return cloned as RunePublicBlock
  } catch {
    return null
  }
}

function blockLocalMarkdown(editor: Editor, node: PMNode): string {
  const serializer = getBlockSpecs(editor)[node.type.name]?.toMarkdown
  if (!serializer) return ""

  const depth = typeof node.attrs.depth === "number" ? node.attrs.depth : 0
  const ctx: RuneMarkdownBlockSerializerContext = {
    editor,
    node,
    depth,
    prefix: "",
    numberedIndex: undefined,
    serializeInline: serializeInlineContent,
  }
  return serializer(ctx)?.line ?? ""
}

export function getBlockOutline(editor: Editor): RuneBlockOutline[] {
  const doc = editor.state.doc
  const outline: RuneBlockOutline[] = []
  // Recurse into nested surfaces (column children) via the shared body-
  // surface walker. `index` is surface-local; `surface` is the containing
  // column's id (omitted for the root surface so root blocks keep their
  // existing shape).
  forEachBodyBlock(doc, ({ node, index, surfacePos }) => {
    const id = typeof node.attrs.id === "string" ? node.attrs.id : ""
    const entry: RuneBlockOutline = {
      id,
      type: node.type.name,
      depth: typeof node.attrs.depth === "number" ? node.attrs.depth : 0,
      index,
      preview: blockPreview(blockPlainText(node)),
    }
    // Surface id straight from the walker's `surfacePos` — resolving around
    // the block's own pos is wrong for leaf/atom blocks (nodeSize 1), where
    // `pos + 1` lands AFTER the node and reports the layout instead.
    if (surfacePos !== -1) {
      const surfaceId = doc.nodeAt(surfacePos)?.attrs.id
      if (typeof surfaceId === "string") entry.surface = surfaceId
    }
    outline.push(entry)
  })
  return outline
}

export function getBlockSnapshot(
  editor: Editor,
  id: string,
): RuneCommandResult<RuneBlockSnapshot> {
  // Recursive lookup — a column child is snapshot-addressable by id exactly
  // like a root block (parity with getBlockById / getBlockOutline).
  const resolved = resolveBodyBlockById(editor.state.doc, id)
  if (!resolved) {
    return runeCommandError("not-found", `Block "${id}" was not found.`)
  }

  const node = editor.state.doc.nodeAt(resolved.pos)
  if (!node) {
    return runeCommandError("not-found", `Block "${id}" was not found.`)
  }

  const block = jsonSafePublicBlock(blockFromNode(editor, node))
  if (!block) {
    return runeCommandError(
      "unsupported",
      `Block "${id}" cannot be projected to public JSON.`,
    )
  }

  return runeCommandOk({
    block,
    markdown: blockLocalMarkdown(editor, node),
    text: blockPlainText(node),
  })
}

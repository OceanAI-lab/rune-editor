// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Extension } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

import { computeListRuns, type ListRunInfo } from "../list-run-engine"

interface ListNumberingPluginState {
  decorations: DecorationSet
}

export const listNumberingKey = new PluginKey<ListNumberingPluginState>(
  "rune-list-numbering",
)

function buildDecorationsFromRuns(doc: ProseMirrorNode, info: ListRunInfo): DecorationSet {
  const decorations: Decoration[] = []
  for (const block of info.byPos.values()) {
    const attrs: Record<string, string> = { "data-marker-style": block.markerStyle }
    if (block.kind === "numbered" && block.index != null) {
      attrs.style = `--rune-list-index: ${block.index}`
    }
    decorations.push(Decoration.node(block.pos, block.pos + block.nodeSize, attrs))
  }
  return DecorationSet.create(doc, decorations)
}

/**
 * Re-exported for tests and any external caller that wants a one-shot
 * read of the rendered decoration set. Internally just `computeListRuns
 * → buildDecorationsFromRuns`; the run computation lives in the engine.
 */
export function buildListNumberingDecorations(doc: ProseMirrorNode): DecorationSet {
  return buildDecorationsFromRuns(doc, computeListRuns(doc))
}

export const ListNumbering = Extension.create({
  name: "listNumbering",

  addProseMirrorPlugins() {
    return [
      new Plugin<ListNumberingPluginState>({
        key: listNumberingKey,
        state: {
          init: (_, { doc }) => ({ decorations: buildListNumberingDecorations(doc) }),
          apply: (tr, previous, _oldState, newState) => {
            if (!tr.docChanged) return previous
            return { decorations: buildListNumberingDecorations(newState.doc) }
          },
        },
        props: {
          decorations(state) {
            return listNumberingKey.getState(state)?.decorations ?? null
          },
        },
      }),
    ]
  },
})

// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { SuggestionCommitContext } from "./types";
import { TextSelection } from "@tiptap/pm/state";
import { createNodeFromBlockInput } from "../../../api/commands/insertBlocks";
import type {
  RuneBlockInput,
  TurnIntoBlockInput,
} from "../../../api/types";

export function insertOrUpdateBlockForSlashMenu(
  ctx: SuggestionCommitContext,
  block: TurnIntoBlockInput,
): void {
  const { editor, range } = ctx;
  const { state } = editor;
  const $from = state.doc.resolve(range.from);
  const blockNode = $from.node($from.depth);
  const blockEnd = $from.after($from.depth);

  // "Empty" means the block's only text content is the trigger itself
  // — i.e., deleting the range leaves an empty text content.
  const rangeLen = range.to - range.from;
  const isEmptyAfterDelete = blockNode.content.size === rangeLen;

  const attrs = block.props ?? {};
  const nodeType = state.schema.nodes[block.type];
  if (!nodeType) return;

  if (nodeType.isAtom) {
    const paragraphType = state.schema.nodes.paragraph;
    const node = nodeType.create(attrs);

    if (isEmptyAfterDelete) {
      const blockStart = $from.before($from.depth);
      const tr = state.tr.replaceWith(blockStart, blockEnd, node);
      const after = blockStart + node.nodeSize;
      if (paragraphType) tr.insert(after, paragraphType.create());
      if (paragraphType) tr.setSelection(TextSelection.create(tr.doc, after + 1));
      editor.view.dispatch(tr.scrollIntoView());
      editor.view.focus();
      return;
    }

    const newBlockEnd = blockEnd - rangeLen;
    const tr = state.tr.delete(range.from, range.to).insert(newBlockEnd, node);
    const after = newBlockEnd + node.nodeSize;
    if (paragraphType) {
      tr.insert(after, paragraphType.create());
      tr.setSelection(TextSelection.create(tr.doc, after + 1));
    }
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
    return;
  }

  // Container nodes (e.g., table) are neither atom nor textblock — `setNode`
  // only supports textblock conversion, and a bare `replaceWith` of a node
  // type with required structured content (table → `tableRow+`) would fail
  // PM's content-match check. Build the node through the block's `fromInput`
  // (same path used by `editor.commands.insertBlocks`) so the default
  // structure (header row + body rows) lands intact.
  const isContainer = !nodeType.isTextblock;
  if (isContainer) {
    const built = createNodeFromBlockInput(
      editor,
      state.schema,
      { type: block.type, ...attrs } as unknown as RuneBlockInput,
      { depth: typeof blockNode.attrs.depth === "number" ? blockNode.attrs.depth : 0 },
    );
    if (!built) return;
    if (isEmptyAfterDelete) {
      const blockStart = $from.before($from.depth);
      const tr = state.tr.replaceWith(blockStart, blockEnd, built);
      const after = blockStart + built.nodeSize;
      const paragraphType = state.schema.nodes.paragraph;
      if (paragraphType) {
        tr.insert(after, paragraphType.create());
      }
      // Land caret inside the container's first leaf (first table cell's
      // tableParagraph), NOT the trailing paragraph — the trailing paragraph
      // is for navigation past the container, not the user's intended insert
      // target. TextSelection.near descends from the container's start to
      // the nearest valid text position.
      tr.setSelection(TextSelection.near(tr.doc.resolve(blockStart + 1)));
      editor.view.dispatch(tr.scrollIntoView());
      editor.view.focus();
      return;
    }
    const newBlockEnd = blockEnd - rangeLen;
    const tr = state.tr.delete(range.from, range.to).insert(newBlockEnd, built);
    // Land caret at the start of the inserted container's first leaf
    // (typically the first cell's tableParagraph for table).
    tr.setSelection(TextSelection.near(tr.doc.resolve(newBlockEnd + 1)));
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
    return;
  }

  if (isEmptyAfterDelete) {
    // Delete just the trigger text (leaves an empty block), then convert the
    // block type in-place. If content is provided, insert it afterwards.
    // Tiptap's `setNode` merges the source block's attrs under the new ones
    // (`{ ...$anchor.parent.attrs, ...attributes }`), so `depth` is already
    // preserved here — see the depth regression test in this folder.
    const chain = editor.chain().focus().deleteRange(range).setNode(block.type, attrs);
    if (block.content) {
      chain.insertContent(block.content);
    }
    chain.run();
  } else {
    // The block has content beyond the trigger. Delete the trigger text and
    // insert a new sibling block after the current one. Inherit `depth` from
    // the source block so the new block sits at the same visual indent (e.g.
    // slashing from inside an indented list item produces a heading at the
    // same depth, not a depth-0 outdented one). Then move the selection into
    // the new block — without this, the caret stayed in the source block and
    // typing kept extending the original list (felt like the slash did nothing
    // from the user's POV).
    const newBlockEnd = blockEnd - rangeLen;
    const attrsWithDepth = "depth" in attrs
      ? attrs
      : { ...attrs, depth: blockNode.attrs.depth };
    const nodeSpec = block.content
      ? { type: block.type, attrs: attrsWithDepth, content: [{ type: "text", text: block.content }] }
      : { type: block.type, attrs: attrsWithDepth };
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContentAt(newBlockEnd, nodeSpec)
      .command(({ tr }) => {
        tr.setSelection(TextSelection.create(tr.doc, newBlockEnd + 1));
        return true;
      })
      .run();
  }
}

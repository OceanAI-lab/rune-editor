// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Node } from "@tiptap/core"

// Cell colspan/rowspan are clamped to 1 at parse time. Combined with
// TableMergedCellsGuard's transformPastedHTML (which rewrites raw HTML
// before parseDOM), Rune's document never contains merged cells.
const noMergeAttrs = {
  colspan: { default: 1, parseHTML: () => 1 },
  rowspan: { default: 1, parseHTML: () => 1 },
  // colwidth survives round-trips. The columnResizing plugin writes to
  // it. We don't read it back in this phase; M8.4e-b's PinColumnWidths
  // NodeView will consume it.
  colwidth: {
    default: null as number[] | null,
    parseHTML: (el: HTMLElement) => {
      const s = el.getAttribute("colwidth")
      return s ? s.split(",").map((w) => parseInt(w, 10)) : null
    },
  },
}

export const TableRow = Node.create({
  name: "tableRow",
  content: "(tableCell | tableHeader)+",
  tableRole: "row",
  parseHTML: () => [{ tag: "tr" }],
  renderHTML: ({ HTMLAttributes }) => ["tr", HTMLAttributes, 0],
})

export const TableCell = Node.create({
  name: "tableCell",
  content: "tableParagraph+",
  tableRole: "cell",
  isolating: true,
  addAttributes: () => noMergeAttrs,
  parseHTML: () => [{ tag: "td" }],
  renderHTML: ({ HTMLAttributes }) => ["td", HTMLAttributes, 0],
})

export const TableHeader = Node.create({
  name: "tableHeader",
  content: "tableParagraph+",
  tableRole: "header_cell",
  isolating: true,
  addAttributes: () => noMergeAttrs,
  parseHTML: () => [{ tag: "th" }],
  renderHTML: ({ HTMLAttributes }) => ["th", HTMLAttributes, 0],
})

// Cell content paragraph. Distinct from page-body `paragraph` so it
// doesn't carry id/depth, isn't in BlockId.types, isn't recognized by
// side-menu / MBS / drag / placeholder. parseDOM uses a parent check
// to claim only <p> directly inside <td>/<th>; page-body paragraph's
// parseDOM has the symmetric rejection (Task 8).
export const TableParagraph = Node.create({
  name: "tableParagraph",
  content: "inline*",
  group: "tableContent",
  parseHTML: () => [
    {
      tag: "p",
      getAttrs: (el: HTMLElement | string) => {
        if (typeof el === "string") return false
        const parent = el.parentElement
        if (!parent) return false
        return parent.tagName === "TD" || parent.tagName === "TH" ? null : false
      },
    },
  ],
  renderHTML: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
})

// prosemirror-tables consults `tableRole` on the node spec via
// `extendNodeSchema` in tiptap's table extension. Since we're not using
// that extension, declare the type augmentation here so `tableRole`
// is a known NodeConfig field for our four nodes.
declare module "@tiptap/core" {
  interface NodeConfig {
    tableRole?: "table" | "row" | "cell" | "header_cell"
  }
}

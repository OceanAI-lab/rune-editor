// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

function escapePipe(text: string): string {
  return text.replace(/\|/g, "\\|")
}

export function serializeTableMarkdown(
  node: ProseMirrorNode,
  serializeInline: (node: ProseMirrorNode) => string,
): string {
  const rows: string[][] = []
  let hasHeader = false

  node.content.forEach((row) => {
    const cells: string[] = []
    let rowIsHeader = false
    row.content.forEach((cell) => {
      if (cell.type.name === "tableHeader") rowIsHeader = true
      const parts: string[] = []
      cell.content.forEach((child) => {
        parts.push(escapePipe(serializeInline(child)))
      })
      cells.push(parts.join("<br>"))
    })
    if (rowIsHeader) hasHeader = true
    rows.push(cells)
  })

  if (rows.length === 0) return ""

  const colCount = Math.max(...rows.map((r) => r.length))
  const lines: string[] = []

  if (!hasHeader) {
    // Synthesize empty header (single space per cell)
    const emptyHeader = Array.from({ length: colCount }, () => " ")
    lines.push(`| ${emptyHeader.join(" | ")} |`)
    lines.push(`| ${Array.from({ length: colCount }, () => "---").join(" | ")} |`)
    for (const row of rows) {
      const padded = Array.from({ length: colCount }, (_, i) => row[i] ?? "")
      lines.push(`| ${padded.join(" | ")} |`)
    }
  } else {
    // First row is header
    const headerRow = rows[0]!
    const padded = Array.from({ length: colCount }, (_, i) => headerRow[i] ?? "")
    lines.push(`| ${padded.join(" | ")} |`)
    lines.push(`| ${Array.from({ length: colCount }, () => "---").join(" | ")} |`)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]!
      const paddedRow = Array.from({ length: colCount }, (_, j) => row[j] ?? "")
      lines.push(`| ${paddedRow.join(" | ")} |`)
    }
  }

  return lines.join("\n")
}

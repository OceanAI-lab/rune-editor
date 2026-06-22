// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Node as PMNode, Mark } from "@tiptap/pm/model"

const MARK_SYNTAX: Record<string, { open: string; close: string }> = {
  bold: { open: "**", close: "**" },
  italic: { open: "*", close: "*" },
  strike: { open: "~~", close: "~~" },
}

const DROPPED_MARKS = new Set(["underline", "textStyle"])

function escapeLinkText(text: string): string {
  return text.replace(/[[\]]/g, (ch) => `\\${ch}`)
}

function escapeLinkHref(href: string): string {
  return href.replace(/[()]/g, (ch) => `\\${ch}`)
}

// PM sorts marks by schema definition order: bold/italic/strike/code before link.
// Last-processed mark wraps outermost, so link wrapping bold produces [**text**](url).
function wrapWithMarks(text: string, marks: readonly Mark[]): string {
  if (text === "") return ""

  let result = text

  for (const mark of marks) {
    const name = mark.type.name

    if (DROPPED_MARKS.has(name)) continue

    if (name === "link") {
      result = `[${escapeLinkText(result)}](${escapeLinkHref(mark.attrs.href as string)})`
      continue
    }

    if (name === "code") {
      result = result.includes("`")
        ? `\`\` ${result} \`\``
        : `\`${result}\``
      continue
    }

    if (name === "wikiLink") {
      const target = mark.attrs.target as string
      result =
        target === result ? `[[${target}]]` : `[[${target}|${result}]]`
      continue
    }

    const syntax = MARK_SYNTAX[name]
    if (syntax) {
      result = `${syntax.open}${result}${syntax.close}`
    }
  }

  return result
}

export function serializeInlineContent(node: PMNode): string {
  const parts: string[] = []

  node.content.forEach((child) => {
    if (child.type.name === "inlineMath") {
      parts.push(`$${child.attrs.latex as string}$`)
      return
    }

    if (child.isText && child.text != null) {
      parts.push(wrapWithMarks(child.text, child.marks))
    }
  })

  return parts.join("")
}

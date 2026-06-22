// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Mark, Node as ProseMirrorNode, Schema } from "@tiptap/pm/model"

/**
 * Parse a SAFE, conservative subset of inline markdown in a text block's `text`
 * input into marked inline nodes. An AI/agent tool (or generate) habitually
 * emits `**bold**` / `*italic*` / `` `code` `` / `~~strike~~` / `[label](url)`
 * in the plain `text` field; without this each block rendered the literal
 * delimiter characters instead of the formatting. Text blocks call this in
 * `fromInput` in place of `schema.text(text)` — so `insert_blocks`,
 * `update_block`, `turn_into`, and generate all benefit. CodeBlock does NOT
 * (code is literal).
 *
 * Conservative on purpose — a false positive on plain prose is worse than a
 * missed mark:
 *   - emphasis delimiters must hug non-space text (`2 * 3` is untouched),
 *   - `_` only fires at word boundaries (`snake_case_name` stays literal),
 *   - a lone / unclosed delimiter stays literal,
 *   - code-span interiors are literal (no nested marks),
 *   - `\*` escapes to a literal `*`,
 *   - links only when the href is a safe scheme (http(s)/mailto/relative),
 *   - a mark absent from the schema falls back to literal text (the block shows
 *     the characters rather than dropping them).
 */
export function inlineContentFromText(schema: Schema, text: string): ProseMirrorNode[] {
  if (!text) return []
  return parseRuns(schema, text, [])
}

const ESCAPABLE = new Set(["\\", "*", "_", "`", "~", "[", "]", "(", ")"])
const WORD = /[\p{L}\p{N}_]/u

function isWord(ch: string | undefined): boolean {
  return ch !== undefined && WORD.test(ch)
}

function makeMark(schema: Schema, name: string, attrs?: Record<string, unknown>): Mark | null {
  const type = schema.marks[name]
  return type ? type.create(attrs) : null
}

function safeHref(href: string): boolean {
  if (/^(https?:|mailto:)/i.test(href)) return true
  // relative path, fragment, or query — never a scheme like javascript:
  return /^[/#.?]/.test(href)
}

function parseRuns(schema: Schema, text: string, marks: Mark[]): ProseMirrorNode[] {
  const out: ProseMirrorNode[] = []
  let plain = ""
  const emit = (s: string, m: Mark[]): void => {
    if (s) out.push(schema.text(s, m.length ? m : undefined))
  }
  const flush = (): void => {
    emit(plain, marks)
    plain = ""
  }

  let i = 0
  while (i < text.length) {
    const ch = text[i]!

    // backslash escape: \* -> literal *
    if (ch === "\\" && ESCAPABLE.has(text[i + 1] ?? "")) {
      plain += text[i + 1]
      i += 2
      continue
    }

    // code span `...` — literal interior, no nested marks
    if (ch === "`") {
      const close = text.indexOf("`", i + 1)
      if (close > i + 1) {
        const code = makeMark(schema, "code")
        if (code) {
          flush()
          emit(text.slice(i + 1, close), [code, ...marks])
          i = close + 1
          continue
        }
      }
    }

    // link [label](href)
    if (ch === "[") {
      const link = matchLink(text, i)
      if (link) {
        const mark = makeMark(schema, "link", { href: link.href })
        if (mark) {
          const inner = parseRuns(schema, link.label, [mark, ...marks])
          if (inner.length) {
            flush()
            out.push(...inner)
            i = link.end
            continue
          }
        }
      }
    }

    // strong **...** / strike ~~...~~ (paired two-char delimiters)
    const pair =
      ch === "*" && text[i + 1] === "*" ? "**" : ch === "~" && text[i + 1] === "~" ? "~~" : null
    if (pair) {
      const span = matchDelimited(text, i, pair)
      if (span) {
        const mark = makeMark(schema, pair === "**" ? "bold" : "strike")
        if (mark) {
          flush()
          out.push(...parseRuns(schema, span.inner, [mark, ...marks]))
          i = span.end
          continue
        }
      }
    }

    // emphasis *...* / _..._
    if (ch === "*" || ch === "_") {
      const span = matchEmphasis(text, i, ch)
      if (span) {
        const mark = makeMark(schema, "italic")
        if (mark) {
          flush()
          out.push(...parseRuns(schema, span.inner, [mark, ...marks]))
          i = span.end
          continue
        }
      }
    }

    plain += ch
    i++
  }
  flush()
  return out
}

/** `[label](href)` — label has no `]`, href no spaces and a safe scheme. */
function matchLink(text: string, start: number): { label: string; href: string; end: number } | null {
  const close = text.indexOf("]", start + 1)
  if (close < 0 || text[close + 1] !== "(") return null
  const hrefEnd = text.indexOf(")", close + 2)
  if (hrefEnd < 0) return null
  const label = text.slice(start + 1, close)
  const href = text.slice(close + 2, hrefEnd)
  if (!label || !href || /\s/.test(href) || !safeHref(href)) return null
  return { label, href, end: hrefEnd + 1 }
}

/** `**inner**` / `~~inner~~` — inner non-empty and not space-flanked. */
function matchDelimited(text: string, start: number, delim: string): { inner: string; end: number } | null {
  let from = start + 2
  while (from <= text.length) {
    const close = text.indexOf(delim, from)
    if (close < 0) return null
    const inner = text.slice(start + 2, close)
    if (inner && !/^\s|\s$/.test(inner)) return { inner, end: close + 2 }
    from = close + 2
  }
  return null
}

/**
 * `*inner*` / `_inner_` — single-char emphasis. The opener must be followed by
 * non-space and the closer preceded by non-space (so `2 * 3` never matches);
 * `_` additionally requires a non-word char on each OUTER edge so intra-word
 * underscores (`foo_bar_baz`) stay literal.
 */
function matchEmphasis(text: string, start: number, delim: string): { inner: string; end: number } | null {
  if (text[start + 1] === delim) return null // a **/__ run — handled elsewhere
  const after = text[start + 1]
  if (after === undefined || /\s/.test(after)) return null
  if (delim === "_" && isWord(text[start - 1])) return null
  let j = start + 1
  while (j < text.length) {
    const c = text[j]!
    if (c === "\\") {
      j += 2
      continue
    }
    if (c === delim && text[j + 1] !== delim) {
      const inner = text.slice(start + 1, j)
      const prev = text[j - 1]
      const wordBoundaryOk = delim !== "_" || !isWord(text[j + 1])
      if (inner && prev !== undefined && !/\s/.test(prev) && wordBoundaryOk) {
        return { inner, end: j + 1 }
      }
    }
    j++
  }
  return null
}

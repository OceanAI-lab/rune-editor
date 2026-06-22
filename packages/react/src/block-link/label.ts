// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

const MAX_BLOCK_MENTION_LABEL_LENGTH = 120

export interface RuneBlockMentionLabel {
  docTitle: string
  blockPreview: string
}

function normalizePart(value: string, fallback: string): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized || fallback
}

export function formatBlockMentionLabel(label: RuneBlockMentionLabel): string {
  const docTitle = normalizePart(label.docTitle, "Untitled")
  const blockPreview = normalizePart(label.blockPreview, "Empty block")
  const text = `${docTitle} - ${blockPreview}`
  if (text.length <= MAX_BLOCK_MENTION_LABEL_LENGTH) return text
  return `${text.slice(0, MAX_BLOCK_MENTION_LABEL_LENGTH - 3).trimEnd()}...`
}

// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// URL-string helpers shared between LinkMenu (inline composer) and
// LinkEditForm (edit/remove form). Kept in a non-component module so the
// component files stay Fast-Refresh-clean.
export function looksLikeUrl(s: string): boolean {
  return s.trim().includes(".")
}

export function normalizeHref(s: string): string {
  const trimmed = s.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^mailto:/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { RuneBlockLinkTarget } from "./types"

function currentBaseHref(): string {
  if (typeof window !== "undefined" && window.location?.href) {
    return window.location.href
  }
  return "https://rune.local/"
}

export function parseQueryBlockLink(href: string): RuneBlockLinkTarget | null {
  const raw = href.trim()
  if (!raw) return null

  let url: URL
  try {
    url = new URL(raw, currentBaseHref())
  } catch {
    return null
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    if (url.origin !== window.location.origin) return null
  }

  const docId = url.searchParams.get("doc")?.trim() ?? ""
  const blockId = url.searchParams.get("block")?.trim() ?? ""
  if (!docId || !blockId) return null

  return { docId, blockId, href: raw, refTarget: `${docId}#${blockId}` }
}

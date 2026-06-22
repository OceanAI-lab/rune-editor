// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Browser-side runners for the media block actions surfaced by the
// floating bar / side-menu dropdown ("Download", "View original").
// Core stays SSR-importable: window/document are only touched inside
// the function bodies, which run from user clicks.

import { URL_PARSE_BASE } from "./source"

/**
 * Resolve the URL "View original" should open. Embeds prefer the
 * human-facing `sourceUrl` (watch page) over the iframe `embedUrl`;
 * assets prefer `sourceUrl` (where the file came from) over the raw
 * asset `src`.
 */
export function originalMediaUrl(attrs: {
  sourceType?: unknown
  src?: unknown
  embedUrl?: unknown
  sourceUrl?: unknown
}): string | null {
  const sourceUrl = typeof attrs.sourceUrl === "string" ? attrs.sourceUrl : ""
  const embedUrl = typeof attrs.embedUrl === "string" ? attrs.embedUrl : ""
  const src = typeof attrs.src === "string" ? attrs.src : ""
  const url =
    attrs.sourceType === "embed" ? sourceUrl || embedUrl : sourceUrl || src
  return url || null
}

export function openMediaOriginal(url: string): boolean {
  if (typeof window === "undefined" || !url) return false
  window.open(url, "_blank", "noopener,noreferrer")
  return true
}

function filenameFromUrl(src: string, fallback: string): string {
  try {
    const url = new URL(src, URL_PARSE_BASE)
    // new URL() parses data:/blob: fine — their "pathname" is the payload
    // / an opaque UUID, not a filename, so only trust http(s) paths.
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback
    const last = url.pathname.split("/").filter(Boolean).pop()
    if (last) return decodeURIComponent(last)
  } catch {
    /* malformed URLs / bad escapes fall through to the fallback */
  }
  return fallback
}

/**
 * Download a media asset. `<a download>` is ignored cross-origin (the
 * browser navigates instead), so fetch → blob → object URL first and
 * fall back to opening the asset in a new tab when CORS blocks the
 * fetch. Fire-and-forget: callers treat the click as handled.
 */
export function downloadMediaAsset(src: string, name?: string): boolean {
  if (typeof window === "undefined" || typeof document === "undefined" || !src)
    return false

  const filename = filenameFromUrl(src, name?.trim() || "download")
  const clickAnchor = (href: string, download?: string) => {
    const a = document.createElement("a")
    a.href = href
    if (download !== undefined) a.download = download
    else a.target = "_blank"
    a.rel = "noopener noreferrer"
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  if (src.startsWith("data:") || src.startsWith("blob:")) {
    clickAnchor(src, filename)
    return true
  }

  void fetch(src)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.blob()
    })
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob)
      clickAnchor(objectUrl, filename)
      // Revoke after the click has been dispatched; immediate revocation
      // races the browser's download start in Safari.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
    })
    .catch(() => {
      // CORS-blocked (common for hotlinked images) — viewing the original
      // in a new tab is the closest the browser lets us get.
      clickAnchor(src)
    })
  return true
}

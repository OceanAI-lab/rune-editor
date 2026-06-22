// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { RuneBlockBase } from "../../types"
import {
  mediaResultToAttrs,
  normalizeMediaUrlInput,
  validateMediaImportResult,
  type MediaEmbedProvider,
  type MediaSourceType,
} from "../media"
import {
  createSourceMediaBlockSpec,
  type SourceMediaAttrs,
} from "../media/createSourceMediaBlockSpec"
import { isMediaImportResult } from "../media/source-input-helpers"

const AUDIO_ICON_PATHS = [
  "M9.25 4.125a.625.625 0 0 1 .625.625v8.5a2.625 2.625 0 1 1-1.25-2.235V6.345L6.75 6.72a.625.625 0 1 1-.245-1.226l2.622-.524a.6.6 0 0 1 .123-.013zM7.25 12a1.375 1.375 0 1 0 1.375 1.375V12.79A1.37 1.37 0 0 0 7.25 12",
  "M12.625 5.875a.625.625 0 0 1 .884 0 5.125 5.125 0 0 1 0 7.25.625.625 0 1 1-.884-.884 3.875 3.875 0 0 0 0-5.482.625.625 0 0 1 0-.884",
  "M14.75 3.75a.625.625 0 0 1 .884 0 8.125 8.125 0 0 1 0 11.5.625.625 0 0 1-.884-.884 6.875 6.875 0 0 0 0-9.732.625.625 0 0 1 0-.884",
]

type AudioAttrs = SourceMediaAttrs

function soundCloudSourceUrlFromIframeSrc(src: string): string | null {
  try {
    const url = new URL(src)
    const host = url.hostname.toLowerCase().replace(/^www\./, "")
    if (host !== "w.soundcloud.com") return null
    if (url.pathname !== "/player/") return null
    return url.searchParams.get("url")
  } catch {
    return null
  }
}

function audioEmbedAttrsFromIframe(iframe: HTMLIFrameElement): Partial<AudioAttrs> | false {
  const src = iframe.getAttribute("src")
  if (!src) return false
  const sourceUrl = soundCloudSourceUrlFromIframeSrc(src)
  if (!sourceUrl) return false

  const normalized = normalizeMediaUrlInput("audio", sourceUrl)
  if (
    !isMediaImportResult(normalized) ||
    normalized.kind !== "embed" ||
    normalized.provider !== "soundcloud"
  ) {
    return false
  }

  const validation = validateMediaImportResult("audio", normalized)
  if (!validation.ok) return false

  return {
    ...mediaResultToAttrs(validation.result),
    title: iframe.getAttribute("title") ?? normalized.title ?? "",
  }
}

export const Audio = createSourceMediaBlockSpec({
  type: "audio",
  className: "rune-audio",
  iconPaths: AUDIO_ICON_PATHS,
  allowedProviders: ["soundcloud"],
  assetDataAttr: "data-rune-audio",
  assetTag: "audio",
  assetHasDimensions: false,
  supportsAlign: false,
  includeContentWidthInOutput: false,
  // The React NodeView replaces the bare <audio> with a custom player
  // wrapper — the selector must match it too or handles never mount there.
  resizeMediaSelector:
    "audio[data-rune-audio], [data-rune-audio-player], iframe[data-rune-media-embed]",
  toMarkdown({ prefix, node }) {
    const title =
      (typeof node.attrs.title === "string" && node.attrs.title) || "Audio"
    const url =
      node.attrs.sourceType === "embed"
        ? (node.attrs.embedUrl as string) || (node.attrs.src as string) || ""
        : (node.attrs.src as string) || ""
    return { line: `${prefix}[${title}](${url})` }
  },
  slash: {
    key: "audio",
    title: "Audio",
    aliases: ["audio", "sound", "soundcloud"],
    group: "Media",
  },
  schemaContext: {
    input: {
      examples: [
        {
          type: "audio",
          sourceType: "asset",
          src: "https://example.com/audio.mp3",
        },
      ],
    },
  },
  extraParseDOM: [
    {
      tag: 'iframe[src^="https://w.soundcloud.com/player/"]',
      getAttrs: (el) => audioEmbedAttrsFromIframe(el as HTMLIFrameElement),
    },
  ],
})

export interface RuneAudioBlock extends RuneBlockBase {
  type: "audio"
  sourceType: MediaSourceType
  src: string
  embedUrl: string | null
  provider: MediaEmbedProvider | null
  sourceUrl: string | null
  title: string
  width: number | null
  height: number | null
}

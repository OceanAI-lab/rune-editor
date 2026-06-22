// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { RuneBlockBase } from "../../types"
import {
  isSupportedMediaUrlReference,
  mediaResultToAttrs,
  normalizeMediaUrlInput,
  validateMediaImportResult,
  type MediaEmbedProvider,
  type MediaSourceType,
} from "../media"
import { parseContentWidthAttrs } from "../media/contentWidth"
import type { MediaAlign } from "../media/align"
import {
  createSourceMediaBlockSpec,
  type SourceMediaAttrs,
} from "../media/createSourceMediaBlockSpec"
import {
  isMediaImportResult,
  numAttr,
} from "../media/source-input-helpers"

const VIDEO_ICON_PATHS = [
  "M3.5 5.75c0-.966.784-1.75 1.75-1.75h6.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 11.75 16h-6.5a1.75 1.75 0 0 1-1.75-1.75zM5.25 5.25a.5.5 0 0 0-.5.5v8.5c0 .276.224.5.5.5h6.5a.5.5 0 0 0 .5-.5v-8.5a.5.5 0 0 0-.5-.5z",
  "M13.5 8.05 16.06 6.4a.625.625 0 0 1 .94.526v6.148a.625.625 0 0 1-.94.526L13.5 11.95zm1.25.684v2.532l1-.645V9.379z",
  "M7.625 7.59a.625.625 0 0 1 .64.026l2.25 1.375a.625.625 0 0 1 0 1.066l-2.25 1.375a.625.625 0 0 1-.951-.533v-2.75c0-.227.123-.436.311-.555",
]

type VideoAttrs = SourceMediaAttrs

function videoEmbedAttrsFromIframe(iframe: HTMLIFrameElement): Partial<VideoAttrs> | false {
  const sourceUrl =
    iframe.getAttribute("data-rune-source-url") ?? iframe.getAttribute("src")
  if (!sourceUrl) return false

  const normalized = normalizeMediaUrlInput("video", sourceUrl)
  if (!isMediaImportResult(normalized) || normalized.kind !== "embed") {
    return false
  }

  const validation = validateMediaImportResult("video", normalized)
  if (!validation.ok) return false

  return {
    ...mediaResultToAttrs(validation.result),
    title: iframe.getAttribute("title") ?? normalized.title ?? "",
    width: numAttr(iframe, "width"),
    height: numAttr(iframe, "height"),
  }
}

function videoSourceFromElement(video: HTMLVideoElement): string {
  return (
    video.getAttribute("src") ||
    video.querySelector<HTMLSourceElement>("source[src]")?.getAttribute("src") ||
    ""
  )
}

function runeVideoAttrsFromChrome(el: HTMLElement): Partial<VideoAttrs> | false {
  const content = el.querySelector<HTMLElement>(
    ":scope > .rune-block-content",
  )
  if (!content) return false

  const base = {
    id: el.getAttribute("data-id"),
    depth: numAttr(el, "data-depth") ?? 0,
    contentWidth: parseContentWidthAttrs(content),
  }

  const video = content.querySelector<HTMLVideoElement>(
    ":scope > video[data-rune-video]",
  )
  if (video) {
    const src = videoSourceFromElement(video)
    if (!src || !isSupportedMediaUrlReference(src)) return false
    return {
      ...base,
      sourceType: "asset",
      src,
      embedUrl: null,
      provider: null,
      sourceUrl: null,
      title: video.getAttribute("title") ?? "",
      width: numAttr(video, "width"),
      height: numAttr(video, "height"),
    }
  }

  const iframe = content.querySelector<HTMLIFrameElement>(
    ":scope > iframe[data-rune-media-embed]",
  )
  if (!iframe) {
    const isEmptyChrome =
      el.classList.contains("rune-media-empty") ||
      content.querySelector(":scope > .rune-video-empty-control") !== null
    if (!isEmptyChrome) return false
    return {
      ...base,
      sourceType: "asset",
      src: "",
      embedUrl: null,
      provider: null,
      sourceUrl: null,
      title: "",
      width: null,
      height: null,
      contentWidth: null,
    }
  }

  const attrs = videoEmbedAttrsFromIframe(iframe)
  return attrs ? { ...base, ...attrs } : false
}

export const Video = createSourceMediaBlockSpec({
  type: "video",
  className: "rune-video",
  iconPaths: VIDEO_ICON_PATHS,
  allowedProviders: ["youtube", "vimeo"],
  assetDataAttr: "data-rune-video",
  assetTag: "video",
  assetHasDimensions: true,
  supportsAlign: true,
  includeContentWidthInOutput: true,
  toMarkdown({ prefix, node }) {
    const title =
      (typeof node.attrs.title === "string" && node.attrs.title) || "Video"
    const url =
      node.attrs.sourceType === "embed"
        ? (node.attrs.embedUrl as string) || (node.attrs.src as string) || ""
        : (node.attrs.src as string) || ""
    return { line: `${prefix}[${title}](${url})` }
  },
  slash: {
    key: "video",
    title: "Video",
    aliases: ["video", "movie", "youtube", "vimeo"],
    group: "Media",
  },
  schemaContext: {
    input: {
      examples: [
        {
          type: "video",
          sourceType: "asset",
          src: "https://example.com/video.mp4",
        },
      ],
    },
  },
  extraParseDOM: [
    {
      tag: "div.rune-block.rune-video",
      getAttrs: (el) => runeVideoAttrsFromChrome(el as HTMLElement),
    },
    {
      tag: 'iframe[src]',
      getAttrs: (el) => videoEmbedAttrsFromIframe(el as HTMLIFrameElement),
    },
  ],
})

export interface RuneVideoBlock extends RuneBlockBase {
  type: "video"
  sourceType: MediaSourceType
  src: string
  embedUrl: string | null
  provider: MediaEmbedProvider | null
  sourceUrl: string | null
  title: string
  width: number | null
  height: number | null
  contentWidth?: number | null
  /** Horizontal placement of the media within the block. Absent → center. */
  align?: MediaAlign
}

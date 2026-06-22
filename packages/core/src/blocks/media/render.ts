// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { DOMOutputSpec } from "@tiptap/pm/model"
import { mergeBlockHTMLAttributes } from "../../schema"
import type { MediaEmbedProvider, SourcedBlockKind } from "./source"

// Value lives in rune-tokens.css (--rune-media-pad-top) so the core and
// React render paths can't drift (#298).
export const MEDIA_PAD_TOP = "var(--rune-media-pad-top)"

type MediaRenderKind = Extract<SourcedBlockKind, "video" | "audio">

// Labels mirror Notion's empty media blocks (spec 2026-06-11 §1.3).
export const MEDIA_PLACEHOLDER_LABELS: Record<MediaRenderKind, string> = {
  video: "Add a video",
  audio: "Add an audio file",
}

export function renderEmptyMediaDOM(
  kind: MediaRenderKind,
  outer: Record<string, any>,
  contentAttrs: Record<string, string>,
  iconPaths: string[],
): DOMOutputSpec {
  const outerAttrs = mergeBlockHTMLAttributes(outer, {
    className: [
      `rune-${kind}`,
      "rune-media-empty",
    ].filter(Boolean).join(" "),
    styleVars: { "--block-pad-top": MEDIA_PAD_TOP },
  })

  return [
    "div",
    outerAttrs,
    [
      "div",
      contentAttrs,
      [
        "div",
        { class: `rune-media-empty-control rune-${kind}-empty-control` },
        [
          "div",
          { class: `rune-media-empty-icon rune-${kind}-empty-icon` },
          [
            "http://www.w3.org/2000/svg svg",
            {
              "aria-hidden": "true",
              role: "graphics-symbol",
              viewBox: "0 0 20 20",
              class: `rune-media-empty-icon-svg rune-${kind}-empty-icon-svg`,
            },
            ...iconPaths.map((d) => [
              "http://www.w3.org/2000/svg path",
              { d },
            ]),
          ],
        ],
        [
          "span",
          { class: `rune-media-empty-label rune-${kind}-empty-label` },
          MEDIA_PLACEHOLDER_LABELS[kind],
        ],
      ],
    ],
  ]
}

export function iframeAttrs(
  provider: MediaEmbedProvider,
  embedUrl: string,
  title: string,
): Record<string, string> {
  const isSoundCloud = provider === "soundcloud"
  return {
    src: embedUrl,
    title: title || provider,
    loading: "lazy",
    referrerpolicy: "strict-origin-when-cross-origin",
    "data-rune-media-embed": "",
    allow: isSoundCloud
      ? "autoplay"
      : "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
    ...(isSoundCloud ? {} : { allowfullscreen: "" }),
  }
}

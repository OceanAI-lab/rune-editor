// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import {
  normalizeMediaUrlInput,
  validateMediaImportResult,
  mediaResultToAttrs,
} from "./source"
import type {
  MediaImportResult,
  MediaSourceAttrs,
  RuneImportMediaFile,
  RuneImportMediaUrl,
  RuneMediaImportContext,
  RuneMediaImportSource,
} from "./source"

type MediaHookTypeExports = {
  source: RuneMediaImportSource
  context: RuneMediaImportContext
  importFile: RuneImportMediaFile
  importUrl: RuneImportMediaUrl
}

const mediaImportContext: RuneMediaImportContext = {
  blockId: "media1",
  kind: "video",
  nodeName: "video",
  source: "picker",
}

const importMediaFile: RuneImportMediaFile = async (_file, context) => ({
  kind: "asset",
  src: `/media/${context.blockId}`,
  title: context.nodeName,
})

const importMediaUrl: RuneImportMediaUrl = async (url, context) => ({
  kind: "asset",
  src: url,
  sourceUrl: url,
  title: context.source,
})

const mediaHookTypeExports: MediaHookTypeExports = {
  source: mediaImportContext.source,
  context: mediaImportContext,
  importFile: importMediaFile,
  importUrl: importMediaUrl,
}

void mediaHookTypeExports

describe("media source helpers", () => {
  it.each([
    [
      "video",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      {
        kind: "embed",
        provider: "youtube",
        embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
    ],
    [
      "video",
      "https://youtu.be/dQw4w9WgXcQ",
      {
        kind: "embed",
        provider: "youtube",
        embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        sourceUrl: "https://youtu.be/dQw4w9WgXcQ",
      },
    ],
    [
      "video",
      "https://vimeo.com/123456789",
      {
        kind: "embed",
        provider: "vimeo",
        embedUrl: "https://player.vimeo.com/video/123456789",
        sourceUrl: "https://vimeo.com/123456789",
      },
    ],
    [
      "audio",
      "https://soundcloud.com/example/demo-track",
      {
        kind: "embed",
        provider: "soundcloud",
        embedUrl: "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fexample%2Fdemo-track",
        sourceUrl: "https://soundcloud.com/example/demo-track",
      },
    ],
  ] as const)("normalizes %s provider URL %s", (kind, input, expected) => {
    expect(normalizeMediaUrlInput(kind, input)).toMatchObject(expected)
  })

  it.each([
    ["https://www.youtube.com/watch?v=abc%0Adef"],
    ["https://www.youtube.com/watch?v=abc%3Fautoplay%3D1"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ/evil"],
  ])("rejects malformed YouTube ID %s", (input) => {
    expect(normalizeMediaUrlInput("video", input)).toMatchObject({
      ok: false,
      error: "Unsupported media embed",
    })
  })

  it.each([
    ["/local/video.mp4"],
    ["media/audio.mp3"],
    ["https://cdn.example.com/media.mp4"],
    ["app-asset://vault/video.mp4"],
    ["blob:https://example.com/asset"],
  ])("accepts asset URL reference %s", (src) => {
    const result = validateMediaImportResult("video", {
      kind: "asset",
      src,
      width: 640,
      height: 360,
      title: "Asset",
    })
    expect(result.ok).toBe(true)
  })

  it.each(["javascript:alert(1)", "vbscript:msgbox(1)"])(
    "rejects blocked asset protocol %s",
    (src) => {
      const result = validateMediaImportResult("video", {
        kind: "asset",
        src,
      })
      expect(result).toMatchObject({
        ok: false,
        error: "Unsupported media URL",
      })
    },
  )

  it("rejects raw iframe markup as a URL reference", () => {
    const src = '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>'

    expect(validateMediaImportResult("video", {
      kind: "asset",
      src,
    })).toMatchObject({
      ok: false,
      error: "Unsupported media URL",
    })

    expect(normalizeMediaUrlInput("video", src)).toMatchObject({
      ok: false,
      error: "Unsupported media URL",
    })
  })

  it("rejects an image embed result", () => {
    const result = validateMediaImportResult("image", {
      kind: "embed",
      provider: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    })

    expect(result.ok).toBe(false)
  })

  it("rejects a soundcloud embed for video", () => {
    const result = validateMediaImportResult("video", {
      kind: "embed",
      provider: "soundcloud",
      sourceUrl: "https://soundcloud.com/example/demo",
      embedUrl: "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fexample%2Fdemo",
    })

    expect(result.ok).toBe(false)
  })

  it("maps asset and embed results to persisted attrs", () => {
    expect(mediaResultToAttrs({
      kind: "asset",
      src: "/video.mp4",
      title: "Clip",
      width: 640,
      height: 360,
      sourceUrl: "/source.mov",
    })).toEqual({
      sourceType: "asset",
      src: "/video.mp4",
      embedUrl: null,
      provider: null,
      sourceUrl: "/source.mov",
      title: "Clip",
      width: 640,
      height: 360,
    })

    expect(mediaResultToAttrs({
      kind: "embed",
      provider: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      title: "Demo",
    })).toEqual({
      sourceType: "embed",
      src: "",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      provider: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Demo",
      width: null,
      height: null,
    })
  })

  it("maps asset alt text to title when title is missing", () => {
    expect(mediaResultToAttrs({
      kind: "asset",
      src: "/image.png",
      alt: "Alt text",
    })).toMatchObject({
      sourceType: "asset",
      src: "/image.png",
      title: "Alt text",
    } satisfies Partial<MediaSourceAttrs>)
  })

  it("maps missing embed title to an empty string", () => {
    const result: MediaImportResult = {
      kind: "embed",
      provider: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    }

    expect(mediaResultToAttrs(result)).toMatchObject({
      sourceType: "embed",
      title: "",
    } satisfies Partial<MediaSourceAttrs>)
  })
})

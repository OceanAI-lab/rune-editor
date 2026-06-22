// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { afterEach, describe, expect, it, vi } from "vitest"
import {
  downloadMediaAsset,
  openMediaOriginal,
  originalMediaUrl,
} from "./assetActions"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("originalMediaUrl", () => {
  it("prefers sourceUrl over embedUrl for embeds", () => {
    expect(
      originalMediaUrl({
        sourceType: "embed",
        sourceUrl: "https://youtube.com/watch?v=x",
        embedUrl: "https://youtube.com/embed/x",
        src: "",
      }),
    ).toBe("https://youtube.com/watch?v=x")
    expect(
      originalMediaUrl({
        sourceType: "embed",
        sourceUrl: null,
        embedUrl: "https://youtube.com/embed/x",
        src: "",
      }),
    ).toBe("https://youtube.com/embed/x")
  })

  it("prefers sourceUrl over src for assets", () => {
    expect(
      originalMediaUrl({
        sourceType: "asset",
        sourceUrl: "https://origin.example/file.mp3",
        embedUrl: null,
        src: "https://cdn.example/file.mp3",
      }),
    ).toBe("https://origin.example/file.mp3")
    expect(
      originalMediaUrl({
        sourceType: "asset",
        sourceUrl: null,
        embedUrl: null,
        src: "https://cdn.example/file.mp3",
      }),
    ).toBe("https://cdn.example/file.mp3")
  })

  it("returns null when nothing is resolvable", () => {
    expect(
      originalMediaUrl({ sourceType: "asset", sourceUrl: null, embedUrl: null, src: "" }),
    ).toBeNull()
  })
})

describe("openMediaOriginal", () => {
  it("opens the url in a new tab with noopener", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)

    expect(openMediaOriginal("https://example.com/x")).toBe(true)
    expect(open).toHaveBeenCalledWith(
      "https://example.com/x",
      "_blank",
      "noopener,noreferrer",
    )
  })

  it("no-ops on an empty url", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)

    expect(openMediaOriginal("")).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })
})

describe("downloadMediaAsset", () => {
  it("clicks a download anchor directly for data: URLs", () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {})

    expect(downloadMediaAsset("data:image/png;base64,AAAA", "Pixel")).toBe(true)
    expect(click).toHaveBeenCalledTimes(1)
  })

  it("names data:/blob: downloads from the fallback, not the URL payload", () => {
    const clicked: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function (this: HTMLAnchorElement) {
        clicked.push(this.download)
      },
    )

    // new URL() parses data:/blob: without throwing — the pathname is the
    // base64 payload / an opaque UUID and must never become the filename.
    downloadMediaAsset("data:image/png;base64,AAAA", "Pixel")
    downloadMediaAsset("blob:https://app.example/123e4567-e89b", "Clip")
    downloadMediaAsset("data:image/png;base64,AAAA")
    expect(clicked).toEqual(["Pixel", "Clip", "download"])
  })

  it("falls back to a new-tab anchor when fetch is CORS-blocked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("CORS"))),
    )
    const clicked: Array<{ href: string; target: string; download: string }> = []
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push({ href: this.href, target: this.target, download: this.download })
      })

    expect(downloadMediaAsset("https://cdn.example/a.png", "Alt")).toBe(true)
    await vi.waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(clicked[0]).toMatchObject({
      href: "https://cdn.example/a.png",
      target: "_blank",
      download: "",
    })
  })

  it("downloads via an object URL when fetch succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(["x"])),
        }),
      ),
    )
    // jsdom ships no URL.createObjectURL — install one for this test.
    const createObjectURL = vi.fn(() => "blob:mock-url")
    Object.defineProperty(URL, "createObjectURL", {
      value: createObjectURL,
      configurable: true,
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      value: vi.fn(),
      configurable: true,
    })
    const clicked: Array<{ href: string; download: string }> = []
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push({ href: this.href, download: this.download })
      })

    try {
      expect(downloadMediaAsset("https://cdn.example/photos/cat.png", "Alt")).toBe(true)
      await vi.waitFor(() => expect(click).toHaveBeenCalledTimes(1))
      expect(clicked[0]).toMatchObject({
        href: "blob:mock-url",
        download: "cat.png",
      })
    } finally {
      delete (URL as unknown as Record<string, unknown>).createObjectURL
      delete (URL as unknown as Record<string, unknown>).revokeObjectURL
    }
  })
})

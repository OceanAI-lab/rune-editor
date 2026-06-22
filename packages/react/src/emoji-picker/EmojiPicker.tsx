// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { forwardRef, useEffect, useState, type ReactNode } from "react"
import { EmojiPicker as Picker } from "frimousse"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const DEFAULT_EMOJIBASE_URL = "https://cdn.jsdelivr.net/npm/emojibase-data"
const PROBE_LOCALE = "en"

export type EmojiPickerSelection = { emoji: string; label: string }

export interface EmojiPickerProps {
  /** Fired when the user picks an emoji (click). */
  onSelect: (selection: EmojiPickerSelection) => void
  /** Number of columns in the grid. Defaults to 10 (matches macOS picker density). */
  columns?: number
  /**
   * Controlled search query. When provided, the picker filters the visible
   * emoji set to matches of this string. The host is expected to drive this
   * from its own input source (e.g. the editor's `:` trigger query) — the
   * picker never renders its own visible search input.
   */
  search?: string
  /**
   * Base URL for the Emojibase JSON data (loaded as
   * `${emojibaseUrl}/${locale}/{data,messages}.json`). Defaults to
   * `https://cdn.jsdelivr.net/npm/emojibase-data` (jsdelivr). Point this at
   * a self-hosted location when the host environment can't reach jsdelivr
   * — e.g. an Electron renderer with a strict `connect-src 'self'` CSP, or
   * a network where the CDN is blocked. Bundle the `emojibase-data` files
   * with your app and serve them at `<base>/en/data.json` /
   * `<base>/en/messages.json`.
   */
  emojibaseUrl?: string
  /**
   * Custom render for the failure state — shown when the Emojibase data
   * fetch errors (e.g. the configured `emojibaseUrl` 404s, the CDN is
   * blocked by CSP, or the network is offline on first load). Without
   * this, the picker would otherwise hang on "Loading…" forever, because
   * frimousse swallows the fetch error internally.
   *
   * Receives the underlying error and a `retry()` that re-attempts the
   * probe. Defaults to a minimal English message with a retry button.
   */
  renderError?: (props: {
    error: Error
    retry: () => void
  }) => ReactNode
  /** Optional extra class on the picker root. */
  className?: string
}

/**
 * Generic emoji picker, batteries-included. Backed by `frimousse` (data
 * fetched from Emojibase, cached locally) and styled to match the macOS
 * picker layout: a scrolling grid with sticky category headers.
 *
 * The picker does NOT render its own search input — filtering is driven
 * externally via the `search` prop. The host owns the typing surface (the
 * editor's `:` trigger, or a hand-mounted input next to the picker). This
 * keeps focus in the host so the user can keep typing without a "focus
 * jump" into the popover (the Notion pattern). The component still mounts
 * `frimousse`'s `Picker.Search` internally so the library's search store
 * stays driven, but it's visually hidden and never grabs focus.
 *
 * The component is generic — it does NOT know about the rune editor. Mount
 * it anywhere a popover wants an emoji picker (e.g. a page title's "Add
 * icon" button). For the in-document `:` trigger, see {@link RuneEmojiPicker}
 * which composes this component with the suggestion-menu state machine.
 */
export const EmojiPicker = forwardRef<HTMLDivElement, EmojiPickerProps>(
  function EmojiPicker(
    {
      onSelect,
      columns = 10,
      search = "",
      emojibaseUrl,
      renderError,
      className,
    },
    ref,
  ) {
    const probeError = useEmojibaseProbe(emojibaseUrl)
    return (
      <Picker.Root
        ref={ref}
        columns={columns}
        emojibaseUrl={emojibaseUrl}
        onEmojiSelect={onSelect}
        className={cn(
          "rune-emoji-picker flex flex-col w-88 h-96 bg-popover text-popover-foreground",
          className,
        )}
      >
        {/*
          frimousse's filter state is only driven through Picker.Search.
          We mount it controlled-but-hidden so the host can pass a query
          via the `search` prop without rendering a second input.
        */}
        <Picker.Search
          value={search}
          tabIndex={-1}
          aria-hidden
          readOnly
          className="sr-only"
          // Stop the hidden input from stealing focus when the popover
          // mounts (Radix's onOpenAutoFocus would otherwise land here).
          onFocus={(e) => e.currentTarget.blur()}
        />
        <Picker.Viewport className="relative flex-1 min-h-0 overflow-hidden">
          <Picker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Loading…
          </Picker.Loading>
          <Picker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            {({ search }) => <>No emoji found for &ldquo;{search}&rdquo;</>}
          </Picker.Empty>
          {probeError.error ? (
            <div
              role="alert"
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-popover px-6 text-center text-sm"
            >
              {renderError ? (
                renderError({
                  error: probeError.error,
                  retry: probeError.retry,
                })
              ) : (
                <>
                  <p className="text-muted-foreground">
                    Couldn&rsquo;t load emoji data.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={probeError.retry}
                  >
                    Retry
                  </Button>
                </>
              )}
            </div>
          ) : null}
          <Picker.List
            className="select-none pb-1"
            components={{
              CategoryHeader: ({ category, ...props }) => (
                <div
                  {...props}
                  className="bg-popover/95 backdrop-blur-sm px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground"
                >
                  {category.label}
                </div>
              ),
              Row: ({ children, ...props }) => (
                <div {...props} className="flex px-1">
                  {children}
                </div>
              ),
              Emoji: ({ emoji, ...props }) => (
                <Button
                  {...props}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "flex aspect-square w-[calc(100%/var(--frimousse-list-columns,10))] items-center justify-center rounded-md text-xl transition-colors",
                    "data-[active=true]:bg-accent data-[active=true]:text-accent-foreground",
                    "h-auto hover:bg-accent",
                  )}
                >
                  {emoji.emoji}
                </Button>
              ),
            }}
          />
        </Picker.Viewport>
      </Picker.Root>
    )
  },
)

/**
 * Detect whether the Emojibase data is reachable. frimousse swallows fetch
 * failures internally (logs to console, leaves the picker stuck on
 * "Loading…"), so we run a parallel HEAD probe to surface the failure to
 * the host. On success the response is also warmed into the browser's
 * HTTP cache, so frimousse's subsequent GET is a cache hit.
 *
 * The probe re-runs whenever `emojibaseUrl` changes or `retry()` is called.
 */
function useEmojibaseProbe(emojibaseUrl: string | undefined) {
  const [error, setError] = useState<Error | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const base = emojibaseUrl ?? DEFAULT_EMOJIBASE_URL
    const url = `${base}/${PROBE_LOCALE}/data.json`
    const controller = new AbortController()
    setError(null)
    fetch(url, { method: "HEAD", signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Emojibase HEAD ${url} → ${res.status}`)
        }
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return
        setError(e instanceof Error ? e : new Error(String(e)))
      })
    return () => controller.abort()
  }, [emojibaseUrl, attempt])

  return {
    error,
    retry: () => setAttempt((n) => n + 1),
  }
}

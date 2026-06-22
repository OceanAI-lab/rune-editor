// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Transaction meta key tagged on every rune-internal normalization tx —
 * structural bookkeeping that mutates the document but is NOT a user edit.
 *
 * Tagged by:
 *   - `BlockId` id-backfill            (extensions/block-id.ts)
 *   - `PinColumnWidths` colwidth pin   (blocks/Table/PinColumnWidths.ts)
 *   - `TableMergedCellsGuard` clamp    (blocks/Table/TableMergedCellsGuard.ts)
 *   - `ListNormalization` start-attr   (extensions/list-normalization/index.ts)
 *
 * Consumer contract — detecting "did the user edit the document":
 *
 *     editor.on("transaction", ({ transaction: tr }) => {
 *       if (tr.docChanged && !tr.getMeta(INTERNAL_NORMALIZATION_META)) {
 *         // user edit → bump "last modified", refresh recents, etc.
 *       }
 *     })
 *
 * All internal-normalization transactions also set `addToHistory: false`,
 * but that flag is overloaded (UI-state syncs use it too). This meta is
 * the more specific signal: it means "rune produced this tx for its own
 * housekeeping; downstream should treat the doc as unchanged from the
 * user's perspective."
 *
 * New rune-internal plugins that dispatch doc-mutating transactions
 * should tag this meta. User-driven commands (slash menu, keymaps,
 * direct API calls like `editor.commands.insertBlocks`) must NOT —
 * those ARE user edits.
 */
export const INTERNAL_NORMALIZATION_META = "rune/internal-normalization"

// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { createContext, useContext, type ReactNode, type FC } from "react";
import type { DefaultReactSuggestionItem, DefaultReactGridSuggestionItem } from "./types";

export type RuneComponentProps = {
  SuggestionMenu: {
    Root: FC<{ id: string; className?: string; children?: ReactNode }>;
    Item: FC<{
      id: string;
      isSelected: boolean;
      onClick: () => void;
      onMouseEnter?: () => void;
      revealOnSelect?: boolean;
      item: Omit<DefaultReactSuggestionItem, "onItemClick">;
      className?: string;
    }>;
    Label: FC<{ className?: string; children?: ReactNode }>;
    Loader: FC<{ className?: string }>;
    EmptyItem: FC<{ className?: string; children?: ReactNode }>;
  };
  GridSuggestionMenu: {
    Root: FC<{ id: string; columns: number; className?: string; children?: ReactNode }>;
    Item: FC<{
      id: string;
      isSelected: boolean;
      onClick: () => void;
      item: DefaultReactGridSuggestionItem;
      className?: string;
    }>;
    Loader: FC<{ columns: number; className?: string }>;
    EmptyItem: FC<{ columns: number; className?: string; children?: ReactNode }>;
  };
};

export const ComponentsContext = createContext<RuneComponentProps | null>(null);

export function useComponentsContext(): RuneComponentProps {
  const ctx = useContext(ComponentsContext);
  if (!ctx) {
    throw new Error(
      "useComponentsContext must be used inside a <ComponentsContext.Provider>. " +
        "<RuneEditor> installs the default provider.",
    );
  }
  return ctx;
}

import { SuggestionMenu } from "./components/SuggestionMenu";
import { SuggestionMenuItem } from "./components/SuggestionMenuItem";
import { SuggestionMenuLabel } from "./components/SuggestionMenuLabel";
import { SuggestionMenuLoader } from "./components/SuggestionMenuLoader";
import { SuggestionMenuEmptyItem } from "./components/SuggestionMenuEmptyItem";

export const defaultComponents: RuneComponentProps = {
  SuggestionMenu: {
    Root: SuggestionMenu,
    Item: SuggestionMenuItem,
    Label: SuggestionMenuLabel,
    Loader: SuggestionMenuLoader,
    EmptyItem: SuggestionMenuEmptyItem,
  },
  GridSuggestionMenu: {
    // Stubs; grid renderer not implemented in v2.
    Root: ({ children }) => <div>{children}</div>,
    Item: ({ onClick, item }) => <div onClick={onClick}>{item.id}</div>,
    Loader: () => null,
    EmptyItem: () => null,
  },
};

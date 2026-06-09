"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { LlmSelection } from "../../lib/types";

const STORAGE_KEY = "aria-llm-selection";

type LlmSelectionContextValue = {
  selection: LlmSelection | null;
  setSelection: (selection: LlmSelection | null) => void;
};

const LlmSelectionContext = createContext<LlmSelectionContextValue | null>(null);

function readStoredSelection(): LlmSelection | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as LlmSelection;
    if (typeof parsed.provider === "string" && typeof parsed.model === "string") {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function LlmSelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelectionState] = useState<LlmSelection | null>(null);

  useEffect(() => {
    setSelectionState(readStoredSelection());
  }, []);

  const setSelection = useCallback((next: LlmSelection | null) => {
    setSelectionState(next);

    if (typeof window === "undefined") {
      return;
    }

    try {
      if (next) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // localStorage may be unavailable in private browsing
    }
  }, []);

  const value = useMemo(
    () => ({
      selection,
      setSelection,
    }),
    [selection, setSelection],
  );

  return (
    <LlmSelectionContext.Provider value={value}>{children}</LlmSelectionContext.Provider>
  );
}

export function useLlmSelection(): LlmSelectionContextValue {
  const context = useContext(LlmSelectionContext);

  if (!context) {
    return {
      selection: null,
      setSelection: () => {},
    };
  }

  return context;
}

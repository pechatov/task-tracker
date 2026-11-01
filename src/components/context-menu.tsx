"use client";

import type { LucideIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { createPortal } from "react-dom";

export type ContextMenuAction = {
  type?: "item";
  id: string;
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export type ContextMenuEntry = ContextMenuAction | { type: "separator"; id: string };

export type ContextMenuState = {
  entries: ContextMenuEntry[];
  title?: string;
  x: number;
  y: number;
};

type ContextMenuPoint = {
  clientX: number;
  clientY: number;
};

const viewportPadding = 8;

function isAction(entry: ContextMenuEntry): entry is ContextMenuAction {
  return entry.type !== "separator";
}

// Drops separators at the edges and duplicated separators that appear when
// conditional entries are filtered out.
function normalizeEntries(entries: ContextMenuEntry[]) {
  return entries.filter((entry, index) => {
    if (isAction(entry)) {
      return true;
    }

    const previous = entries[index - 1];
    const hasActionAfter = entries.slice(index + 1).some(isAction);

    return previous !== undefined && isAction(previous) && hasActionAfter;
  });
}

// Shift + right click keeps the native browser menu as an escape hatch.
export function shouldUseNativeContextMenu(event: { shiftKey: boolean }) {
  return event.shiftKey;
}

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const openMenu = useCallback(
    (point: ContextMenuPoint, entries: ContextMenuEntry[], title?: string) => {
      const normalized = normalizeEntries(entries);

      if (!normalized.some(isAction)) {
        return;
      }

      setMenu({ entries: normalized, title, x: point.clientX, y: point.clientY });
    },
    []
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  return { closeMenu, menu, openMenu };
}

export function ContextMenu({
  menu,
  onClose
}: {
  menu: ContextMenuState | null;
  onClose: () => void;
}) {
  if (!menu || typeof document === "undefined") {
    return null;
  }

  return createPortal(<ContextMenuPanel menu={menu} onClose={onClose} />, document.body);
}

function ContextMenuPanel({
  menu,
  onClose
}: {
  menu: ContextMenuState;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: menu.x, top: menu.y });

  useLayoutEffect(() => {
    const panel = panelRef.current;

    if (!panel) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - viewportPadding;
    const maxTop = window.innerHeight - rect.height - viewportPadding;

    setPosition({
      left: Math.max(viewportPadding, Math.min(menu.x, maxLeft)),
      top: Math.max(viewportPadding, Math.min(menu.y, maxTop))
    });
    panel
      .querySelector<HTMLButtonElement>("button[role=menuitem]:not(:disabled)")
      ?.focus({ preventScroll: true });
  }, [menu]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }

    function onContextMenu(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        return;
      }

      event.preventDefault();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  function moveFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];

    if (!keys.includes(event.key) || !panelRef.current) {
      return;
    }

    event.preventDefault();

    const items = Array.from(
      panelRef.current.querySelectorAll<HTMLButtonElement>(
        "button[role=menuitem]:not(:disabled)"
      )
    );

    if (items.length === 0) {
      return;
    }

    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex = 0;

    if (event.key === "End") {
      nextIndex = items.length - 1;
    } else if (event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % items.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
    }

    items[nextIndex]?.focus();
  }

  return (
    <div
      aria-label={menu.title}
      className="context-menu"
      onKeyDown={moveFocus}
      ref={panelRef}
      role="menu"
      style={{ left: position.left, top: position.top }}
    >
      {menu.title ? <div className="context-menu-title">{menu.title}</div> : null}
      {menu.entries.map((entry) => {
        if (!isAction(entry)) {
          return <div className="context-menu-separator" key={entry.id} role="separator" />;
        }

        const Icon = entry.icon;

        return (
          <button
            className={["context-menu-item", entry.danger ? "danger" : ""]
              .filter(Boolean)
              .join(" ")}
            disabled={entry.disabled}
            key={entry.id}
            onClick={() => {
              onClose();
              entry.onSelect();
            }}
            role="menuitem"
            type="button"
          >
            <span className="context-menu-icon" aria-hidden="true">
              {Icon ? <Icon size={15} /> : null}
            </span>
            <span>{entry.label}</span>
          </button>
        );
      })}
    </div>
  );
}

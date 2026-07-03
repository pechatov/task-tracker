"use client";

import { ChevronUp, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";

export function QuickAddTask({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button className="quick-add" onClick={() => setIsOpen(true)} type="button">
        <span className="quick-add-icon">
          <Plus size={18} />
        </span>
        <span className="quick-add-text">
          <span>Новая задача</span>
          <span className="muted">Нажмите, чтобы открыть полную форму</span>
        </span>
      </button>
    );
  }

  return (
    <div className="quick-add-expanded">
      <button
        className="quick-add-collapse"
        onClick={() => setIsOpen(false)}
        type="button"
      >
        <ChevronUp size={16} />
        Свернуть форму
      </button>
      {children}
    </div>
  );
}

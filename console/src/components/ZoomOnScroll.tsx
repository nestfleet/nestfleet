// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Wraps children in a container that scales from 0.92 → 1.0 with a slight
 * fade-in when the element first enters the viewport.
 */
export function ZoomOnScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        transform:  visible ? "scale(1)"    : "scale(0.92)",
        opacity:    visible ? 1             : 0,
        transition: "transform 0.65s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.55s ease",
      }}
    >
      {children}
    </div>
  );
}

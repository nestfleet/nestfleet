// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

/**
 * Route group layout for /p/[slug]/* — DEFERRED-21.
 *
 * Mounts ProductProvider with the slug from URL params.
 * Auth guarding and AppLayout are provided by the individual page components
 * (each page re-exports the original page which wraps itself in AppLayout).
 */

import { ProductProvider } from "@/lib/product-context";
import { ProductEventStream } from "./ProductEventStream";
import type { ReactNode } from "react";

interface SlugLayoutProps {
  children: ReactNode;
  params:   Promise<{ slug: string }>;
}

export default async function SlugLayout({ children, params }: SlugLayoutProps) {
  const { slug } = await params;

  return (
    <ProductProvider key={slug} slug={slug}>
      <ProductEventStream />
      {children}
    </ProductProvider>
  );
}

"use client";

import { AppProvider } from "@/lib/app-context";
import { Shell } from "@/components/shell";

export default function Page() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

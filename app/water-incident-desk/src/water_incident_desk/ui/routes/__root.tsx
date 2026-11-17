import { ThemeProvider } from "@/components/apx/theme-provider";
import { ModeToggle } from "@/components/apx/mode-toggle";
import { QueryClient } from "@tanstack/react-query";
import { Link, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { Database, Lock, Waves } from "lucide-react";
import { Toaster } from "sonner";

import { useGetMeta, type MetaOut } from "@/lib/api";
import selector from "@/lib/selector";
import { fmtDate } from "@/lib/desk";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: () => (
    <ThemeProvider defaultTheme="light" storageKey="incident-desk-theme">
      <Shell />
      <Toaster richColors />
    </ThemeProvider>
  ),
});

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/events", label: "Register" },
  { to: "/documents", label: "Documents" },
] as const;

function Shell() {
  const meta = useGetMeta(selector<MetaOut>());
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur-[2px]">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-6 px-4 lg:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2 rounded text-foreground no-underline">
            <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Waves className="size-4" aria-hidden />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold">Incident &amp; Report Desk</span>
              <span className="block text-[11px] text-muted-foreground">Torrens Gulf Water · synthetic data</span>
            </span>
          </Link>
          <nav aria-label="Main" className="flex h-full items-stretch gap-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                className="relative flex items-center px-3 text-sm text-muted-foreground no-underline hover:text-foreground data-[status=active]:font-medium data-[status=active]:text-foreground data-[status=active]:after:absolute data-[status=active]:after:inset-x-3 data-[status=active]:after:bottom-0 data-[status=active]:after:h-0.5 data-[status=active]:after:rounded-full data-[status=active]:after:bg-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
            {meta.data ? (
              <>
                <span className="hidden items-center gap-1.5 md:inline-flex" title="Every date in this app is anchored to the last day of data, not today">
                  <Database className="size-3.5" aria-hidden />
                  Data {fmtDate(meta.data.data_from)} – {fmtDate(meta.data.data_to)}
                </span>
                <span className="hidden items-center gap-1.5 lg:inline-flex" title={meta.data.status_note ?? "Statuses are saved to Lakebase"}>
                  {meta.data.status_saving ? (
                    <>
                      <span aria-hidden className="size-2 rounded-full bg-success" />
                      Statuses saved to Lakebase
                    </>
                  ) : (
                    <>
                      <Lock className="size-3.5" aria-hidden />
                      Statuses read-only
                    </>
                  )}
                </span>
              </>
            ) : null}
            <ModeToggle />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-5 lg:px-6">
        <Outlet />
      </main>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { pdfUrl } from "@/lib/desk";
import { Skeleton } from "@/components/ui/skeleton";

GlobalWorkerOptions.workerSrc = workerUrl;

type Load = { state: "loading" } | { state: "ready"; pdf: PDFDocumentProxy } | { state: "error"; message: string };

/**
 * Renders a PDF from the raw volume into the page with PDF.js, one canvas per page,
 * fitted to the panel width. "Open" falls back to the browser's own viewer.
 */
export function PdfViewer({ path, title }: { path: string; title?: string | null }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [width, setWidth] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const fileName = path.split("/").pop() ?? path;

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoad({ state: "loading" });
    const task = getDocument({ url: pdfUrl(path), withCredentials: true });
    task.promise.then(
      (pdf) => (cancelled ? void pdf.destroy() : setLoad({ state: "ready", pdf })),
      (error: unknown) =>
        !cancelled &&
        setLoad({
          state: "error",
          message: error instanceof Error ? error.message : "The file could not be read.",
        }),
    );
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [path]);

  return (
    <figure className="overflow-hidden rounded-md border bg-card">
      <figcaption className="flex items-center gap-2 border-b px-3 py-2 text-sm">
        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium" title={title ?? fileName}>
          {title ?? fileName}
        </span>
        {load.state === "ready" ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {load.pdf.numPages} page{load.pdf.numPages === 1 ? "" : "s"}
          </span>
        ) : null}
        <a
          href={pdfUrl(path)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-foreground underline-offset-2 hover:bg-accent hover:underline"
        >
          Open <ExternalLink className="size-3" aria-hidden />
        </a>
      </figcaption>
      <div ref={frame} className="max-h-[70vh] overflow-auto bg-muted p-3">
        {load.state === "loading" ? <Skeleton className="aspect-[1/1.414] w-full" /> : null}
        {load.state === "error" ? (
          <p role="alert" className="rounded bg-card p-4 text-sm">
            <span className="font-medium text-destructive">This PDF could not be shown.</span>{" "}
            <span className="text-muted-foreground">{load.message} Try “Open” to use the browser’s viewer.</span>
          </p>
        ) : null}
        {load.state === "ready" && width > 0
          ? Array.from({ length: load.pdf.numPages }, (_, i) => (
              <PdfPage key={`${path}-${i}`} pdf={load.pdf} pageNumber={i + 1} width={width - 24} />
            ))
          : null}
      </div>
    </figure>
  );
}

function PdfPage({ pdf, pageNumber, width }: { pdf: PDFDocumentProxy; pageNumber: number; width: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    void pdf.getPage(pageNumber).then((page) => {
      const el = canvas.current;
      if (cancelled || !el) return;
      const base = page.getViewport({ scale: 1 });
      const scale = Math.max(0.5, width / base.width);
      const viewport = page.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      el.width = Math.floor(viewport.width * ratio);
      el.height = Math.floor(viewport.height * ratio);
      el.style.width = `${Math.floor(viewport.width)}px`;
      el.style.height = `${Math.floor(viewport.height)}px`;
      renderTask = page.render({
        canvas: el,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      renderTask.promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageNumber, width]);

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={`Page ${pageNumber}`}
      className="mx-auto mb-3 block rounded-sm bg-white shadow-[0_1px_3px_rgba(11,32,38,0.18)] last:mb-0"
    />
  );
}

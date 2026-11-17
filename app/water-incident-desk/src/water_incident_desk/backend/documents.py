"""PDFs in the raw volume: a live listing, and the bytes of one file.

The listing walks the volume itself rather than the documents table, so a PDF that
lands before anyone indexes it still shows up (as "not indexed").
"""

import time
from dataclasses import dataclass

from databricks.sdk import WorkspaceClient

ROOT = "/Volumes/workshop_demo/water_utilities/raw"
_MAX_DEPTH = 4
_TTL_S = 60
_cache: tuple[float, list["VolumeFile"]] | None = None


@dataclass(frozen=True)
class VolumeFile:
    path: str
    folder: str
    file_name: str
    size_bytes: int | None
    last_modified_ms: int | None


def _walk(ws: WorkspaceClient, directory: str, depth: int) -> list[VolumeFile]:
    found: list[VolumeFile] = []
    for entry in ws.files.list_directory_contents(directory):
        if not entry.path:
            continue
        if entry.is_directory:
            if depth < _MAX_DEPTH:
                found.extend(_walk(ws, entry.path.rstrip("/"), depth + 1))
        elif entry.path.lower().endswith(".pdf"):
            parent = entry.path.rsplit("/", 1)[0]
            found.append(
                VolumeFile(
                    path=entry.path,
                    folder=parent.removeprefix(ROOT).strip("/") or ".",
                    file_name=entry.name or entry.path.rsplit("/", 1)[-1],
                    size_bytes=entry.file_size,
                    last_modified_ms=entry.last_modified,
                )
            )
    return found


def list_pdfs(ws: WorkspaceClient) -> list[VolumeFile]:
    global _cache
    if _cache and time.time() - _cache[0] < _TTL_S:
        return _cache[1]
    files = sorted(_walk(ws, ROOT, 0), key=lambda f: f.path)
    _cache = (time.time(), files)
    return files


def is_listed(ws: WorkspaceClient, path: str) -> bool:
    """Only PDFs under ROOT that the live listing returned may be served."""
    if not path.startswith(ROOT + "/") or ".." in path or not path.lower().endswith(".pdf"):
        return False
    return any(f.path == path for f in list_pdfs(ws))


def read_pdf(ws: WorkspaceClient, path: str) -> bytes:
    response = ws.files.download(path)
    assert response.contents is not None
    with response.contents as stream:
        return stream.read()

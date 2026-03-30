#!/usr/bin/env python3
"""
Export locally stored Cursor Agent transcripts (JSONL) to Markdown.

Scans configurable roots (default: ~/.cursor and Cursor Application Support) for
*.jsonl that live under agent-transcripts/ or match the Agent JSONL shape.

Merges composer metadata from state.vscdb and state.vscdb.backup per workspace
folder so reorganized workspaces still contribute historical composer rows.

Optional: copies SpecStory markdown history from sibling project dirs.

Usage:
  python3 scripts/export-cursor-local-chats.py
  python3 scripts/export-cursor-local-chats.py --output-dir ~/Documents/my-export
  python3 scripts/export-cursor-local-chats.py --jsonl-root ~/.cursor --jsonl-root /path/to/old/.cursor
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

DEFAULT_OUT = Path.home() / ".specstory" / "cursor-local-export"
CURSOR_WORKSPACE_STORAGE = (
    Path.home()
    / "Library"
    / "Application Support"
    / "Cursor"
    / "User"
    / "workspaceStorage"
)


def default_jsonl_roots() -> list[Path]:
    home = Path.home()
    return [
        home / ".cursor",
        home / "Library" / "Application Support" / "Cursor",
    ]


def default_specstory_history_dirs() -> list[Path]:
    """Known multi-root repos in this workspace; extend via --specstory-dir."""
    home = Path.home()
    return [
        home / "Vouchap" / ".specstory" / "history",
        home / "vouchap-website" / ".specstory" / "history",
        home / "vouchap-crm" / ".specstory" / "history",
        home / "aim.link" / ".specstory" / "history",
        home / "aim-link-website" / ".specstory" / "history",
    ]


def _text_from_content_blocks(content: Any) -> str:
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        btype = block.get("type")
        if btype == "text":
            t = block.get("text")
            if isinstance(t, str):
                parts.append(t)
        elif btype in ("tool_use", "tool_result"):
            parts.append(f"[{btype}: {json.dumps(block, ensure_ascii=False)[:500]}…]")
    return "\n".join(parts).strip()


def _strip_user_query_wrapper(text: str) -> str:
    text = text.strip()
    m = re.match(
        r"<user_query>\s*(.*?)\s*</user_query>\s*$",
        text,
        re.DOTALL,
    )
    if m:
        return m.group(1).strip()
    return text


def _iter_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    with path.open("r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def _is_agent_transcript_jsonl(path: Path) -> bool:
    if "agent-transcripts" in path.parts:
        return True
    try:
        with path.open("r", encoding="utf-8", errors="replace") as f:
            line = f.readline()
        if not line.strip():
            return False
        o = json.loads(line)
        return isinstance(o, dict) and "role" in o and "message" in o
    except (OSError, json.JSONDecodeError):
        return False


def discover_jsonl_files(roots: list[Path]) -> list[Path]:
    seen: set[Path] = set()
    out: list[Path] = []
    for root in roots:
        r = root.expanduser().resolve()
        if not r.is_dir():
            continue
        for p in r.rglob("*.jsonl"):
            try:
                rp = p.resolve()
            except OSError:
                continue
            if rp in seen:
                continue
            if not _is_agent_transcript_jsonl(p):
                continue
            seen.add(rp)
            out.append(rp)
    return sorted(out)


def _transcript_to_markdown(
    jsonl_path: Path,
    project_slug: str,
    transcript_label: str,
) -> str:
    lines: list[str] = [
        "# Cursor Agent transcript",
        "",
        f"- **Source file:** `{jsonl_path}`",
        f"- **Workspace slug:** `{project_slug}`",
        f"- **Transcript:** `{transcript_label}`",
        f"- **Exported (UTC):** {datetime.now(timezone.utc).isoformat()}",
        "",
        "---",
        "",
    ]
    for row in _iter_jsonl(jsonl_path):
        role = row.get("role") or "unknown"
        msg = row.get("message") or {}
        content = msg.get("content")
        body = _text_from_content_blocks(content)
        if role == "user":
            body = _strip_user_query_wrapper(body)
        heading = "User" if role == "user" else ("Assistant" if role == "assistant" else role)
        lines.append(f"## {heading}")
        lines.append("")
        lines.append(body if body else "_(empty)_")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _safe_slug(s: str, max_len: int = 80) -> str:
    s = re.sub(r"[^\w\u4e00-\u9fff\-]+", "_", s, flags=re.UNICODE)
    s = s.strip("_")[:max_len] or "untitled"
    return s


def _first_user_preview(jsonl_path: Path, max_chars: int = 60) -> str:
    for row in _iter_jsonl(jsonl_path):
        if row.get("role") != "user":
            continue
        msg = row.get("message") or {}
        body = _text_from_content_blocks(msg.get("content"))
        body = _strip_user_query_wrapper(body).replace("\n", " ").strip()
        if body:
            return body[:max_chars]
    return ""


def _transcript_rel_parts(jsonl_path: Path) -> tuple[str, str]:
    parts = jsonl_path.parts
    try:
        i = parts.index("agent-transcripts")
    except ValueError:
        rel = str(jsonl_path)
        return "flat-or-unknown", _safe_slug(rel, 100)
    project_slug = parts[i - 1] if i > 0 else "unknown-project"
    under = parts[i + 1 : -1]
    stem = jsonl_path.stem
    if not under:
        label = stem
    else:
        label = "__".join(under) + "__" + stem
    return project_slug, label


def export_jsonl_transcripts(
    output_dir: Path,
    jsonl_roots: list[Path],
) -> tuple[int, Path]:
    agent_dir = output_dir / "agent-markdown"
    agent_dir.mkdir(parents=True, exist_ok=True)
    files = discover_jsonl_files(jsonl_roots)
    count = 0
    for jsonl_path in files:
        project_slug, transcript_label = _transcript_rel_parts(jsonl_path)

        preview = _first_user_preview(jsonl_path)
        slug = _safe_slug(preview) if preview else "session"
        out_name = f"{slug}__{transcript_label}.md"
        out_sub = agent_dir / _safe_slug(project_slug, 120)
        out_sub.mkdir(parents=True, exist_ok=True)
        out_path = out_sub / out_name
        md = _transcript_to_markdown(jsonl_path, project_slug, transcript_label)
        out_path.write_text(md, encoding="utf-8")
        count += 1

    return count, agent_dir


def _read_composer_heads(db_path: Path) -> list[dict[str, Any]] | None:
    try:
        uri = f"file:{db_path}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
        cur = conn.cursor()
        cur.execute(
            "SELECT value FROM ItemTable WHERE key = ?",
            ("composer.composerData",),
        )
        row = cur.fetchone()
        conn.close()
        if not row or not row[0]:
            return None
        data = json.loads(row[0])
        composers = data.get("allComposers")
        if not isinstance(composers, list):
            return None
        out: list[dict[str, Any]] = []
        for c in composers:
            if not isinstance(c, dict):
                continue
            if c.get("type") != "head":
                continue
            cid = c.get("composerId")
            out.append(
                {
                    "composerId": cid,
                    "name": c.get("name"),
                    "subtitle": c.get("subtitle"),
                    "unifiedMode": c.get("unifiedMode"),
                    "lastUpdatedAt": c.get("lastUpdatedAt"),
                    "createdAt": c.get("createdAt"),
                }
            )
        return out
    except (OSError, json.JSONDecodeError, sqlite3.Error):
        return None


def _merge_composer_heads(
    *lists: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for lst in lists:
        if not lst:
            continue
        for row in lst:
            cid = row.get("composerId")
            if not isinstance(cid, str):
                continue
            prev = by_id.get(cid)
            if prev is None:
                by_id[cid] = row
                continue
            pu = prev.get("lastUpdatedAt") or 0
            nu = row.get("lastUpdatedAt") or 0
            if nu >= pu:
                by_id[cid] = row
    return sorted(by_id.values(), key=lambda r: (r.get("lastUpdatedAt") or 0), reverse=True)


def _workspace_json_path(ws_dir: Path) -> dict[str, Any] | None:
    wj = ws_dir / "workspace.json"
    if not wj.is_file():
        return None
    try:
        return json.loads(wj.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def export_workspace_storage_map(output_dir: Path) -> Path:
    out_path = output_dir / "workspace-storage-map.md"
    lines: list[str] = [
        "# Cursor workspaceStorage → folder / workspace file",
        "",
        f"- **Generated (UTC):** {datetime.now(timezone.utc).isoformat()}",
        "",
        "Each hash under `~/Library/Application Support/Cursor/User/workspaceStorage/` "
        "maps to a single-folder or `.code-workspace` open. After you reorganize roots, "
        "old hashes may remain until Cursor cleans them up.",
        "",
    ]
    if not CURSOR_WORKSPACE_STORAGE.is_dir():
        out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return out_path

    for ws_dir in sorted(CURSOR_WORKSPACE_STORAGE.iterdir()):
        if not ws_dir.is_dir():
            continue
        wmap = _workspace_json_path(ws_dir)
        lines.append(f"## `{ws_dir.name}`")
        lines.append("")
        if wmap is None:
            lines.append("_(no workspace.json)_")
        else:
            lines.append(f"```json\n{json.dumps(wmap, ensure_ascii=False, indent=2)}\n```")
        lines.append("")

    out_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return out_path


def export_composer_index(output_dir: Path) -> int:
    out_path = output_dir / "workspace-composer-index.md"
    lines: list[str] = [
        "# Cursor workspace composer index (merged metadata)",
        "",
        "Sources: `state.vscdb` and `state.vscdb.backup` per workspace hash, merged by "
        "`composerId` (newer `lastUpdatedAt` wins). Full Agent bodies are in "
        "`agent-markdown/`.",
        "",
        f"- **Generated (UTC):** {datetime.now(timezone.utc).isoformat()}",
        "",
    ]
    n_ws = 0
    if not CURSOR_WORKSPACE_STORAGE.is_dir():
        out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return 0

    for ws_dir in sorted(CURSOR_WORKSPACE_STORAGE.iterdir()):
        if not ws_dir.is_dir():
            continue
        db = ws_dir / "state.vscdb"
        bak = ws_dir / "state.vscdb.backup"
        main_heads = _read_composer_heads(db) if db.is_file() else None
        backup_heads = _read_composer_heads(bak) if bak.is_file() else None
        merged = _merge_composer_heads(main_heads, backup_heads)
        if not merged:
            continue
        n_ws += 1
        wmap = _workspace_json_path(ws_dir)
        lines.append(f"## Workspace `{ws_dir.name}`")
        if wmap is not None:
            lines.append(f"- **workspace.json:** `{json.dumps(wmap, ensure_ascii=False)}`")
        lines.append("")
        for r in merged:
            ts = r.get("lastUpdatedAt")
            lines.append(
                f"- **{r.get('name') or '(no name)'}** — `{r.get('composerId')}` "
                f"— mode: {r.get('unifiedMode')} — updated: {ts} — {r.get('subtitle') or ''}"
            )
        lines.append("")

    out_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return n_ws


def export_legacy_aichat_keys(output_dir: Path) -> tuple[int, Path]:
    """Dump legacy chat JSON if present (older Cursor builds)."""
    legacy_dir = output_dir / "legacy-aichat-json"
    n = 0
    if not CURSOR_WORKSPACE_STORAGE.is_dir():
        return 0, legacy_dir
    legacy_dir.mkdir(parents=True, exist_ok=True)
    key = "workbench.panel.aichat.view.aichat.chatdata"
    for ws_dir in sorted(CURSOR_WORKSPACE_STORAGE.iterdir()):
        if not ws_dir.is_dir():
            continue
        for fname in ("state.vscdb", "state.vscdb.backup"):
            db = ws_dir / fname
            if not db.is_file():
                continue
            try:
                uri = f"file:{db}?mode=ro"
                conn = sqlite3.connect(uri, uri=True)
                cur = conn.cursor()
                cur.execute(
                    "SELECT value FROM ItemTable WHERE key = ?",
                    (key,),
                )
                row = cur.fetchone()
                conn.close()
            except sqlite3.Error:
                continue
            if not row or not row[0]:
                continue
            out = legacy_dir / f"{ws_dir.name}__{fname}.json"
            out.write_text(row[0], encoding="utf-8")
            n += 1
    return n, legacy_dir


def copy_specstory_histories(
    output_dir: Path,
    dirs: list[Path],
) -> tuple[int, Path]:
    dest_root = output_dir / "specstory-md-copies"
    dest_root.mkdir(parents=True, exist_ok=True)
    total = 0
    for d in dirs:
        p = d.expanduser().resolve()
        if not p.is_dir():
            continue
        label = _safe_slug(p.parent.parent.name or "specstory", 40)
        sub = dest_root / label
        sub.mkdir(parents=True, exist_ok=True)
        for f in sorted(p.glob("*.md")):
            if not f.is_file():
                continue
            target = sub / f.name
            try:
                shutil.copy2(f, target)
                total += 1
            except OSError:
                continue
    return total, dest_root


def write_readme(
    output_dir: Path,
    n_jsonl: int,
    n_ws: int,
    n_legacy: int,
    n_spec: int,
    jsonl_roots: list[Path],
) -> None:
    p = output_dir / "README.txt"
    roots_txt = "\n".join(f"  - {r}" for r in jsonl_roots)
    p.write_text(
        "\n".join(
            [
                "Cursor local export (expanded)",
                "",
                f"JSONL search roots:",
                roots_txt,
                "",
                f"agent-markdown/: {n_jsonl} transcript(s) -> Markdown.",
                f"workspace-composer-index.md: merged composer metadata from {n_ws} workspace DB folder(s).",
                f"workspace-storage-map.md: hash -> workspace.json mapping.",
                f"legacy-aichat-json/: {n_legacy} file(s) (only if old Cursor stored aichat.chatdata).",
                f"specstory-md-copies/: {n_spec} SpecStory .md file(s) copied from known repos.",
                "",
                "If you reorganized workspaces, older Agent JSONL may only exist under a backup of "
                "~/.cursor/projects or an older machine; add that path with --jsonl-root.",
                "",
            ]
        ),
        encoding="utf-8",
    )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUT,
        help=f"Output directory (default: {DEFAULT_OUT})",
    )
    ap.add_argument(
        "--jsonl-root",
        type=Path,
        action="append",
        dest="jsonl_roots",
        help="Extra directory to search recursively for *.jsonl (repeatable). "
        "Defaults include ~/.cursor and ~/Library/Application Support/Cursor.",
    )
    ap.add_argument(
        "--specstory-dir",
        type=Path,
        action="append",
        dest="specstory_dirs",
        help="Extra .specstory/history directory to copy .md from (repeatable).",
    )
    ap.add_argument(
        "--skip-specstory",
        action="store_true",
        help="Do not copy SpecStory histories into specstory-md-copies/.",
    )
    args = ap.parse_args()
    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    jsonl_roots = default_jsonl_roots()
    if args.jsonl_roots:
        extra = [p.expanduser().resolve() for p in args.jsonl_roots]
        seen: set[Path] = set()
        merged: list[Path] = []
        for p in jsonl_roots + extra:
            try:
                r = p.resolve()
            except OSError:
                continue
            if r in seen:
                continue
            seen.add(r)
            merged.append(r)
        jsonl_roots = merged

    n_jsonl, _ = export_jsonl_transcripts(output_dir, jsonl_roots)
    export_workspace_storage_map(output_dir)
    n_ws = export_composer_index(output_dir)
    n_legacy, _ = export_legacy_aichat_keys(output_dir)

    spec_dirs = [] if args.skip_specstory else default_specstory_history_dirs()
    if args.specstory_dirs:
        spec_dirs.extend(args.specstory_dirs)
    n_spec, _ = copy_specstory_histories(output_dir, spec_dirs)

    write_readme(output_dir, n_jsonl, n_ws, n_legacy, n_spec, jsonl_roots)

    print(f"JSONL roots: {jsonl_roots}")
    print(f"Wrote {n_jsonl} Markdown file(s) under {output_dir / 'agent-markdown'}")
    print(f"Composer index: {output_dir / 'workspace-composer-index.md'} ({n_ws} workspaces)")
    print(f"Workspace map: {output_dir / 'workspace-storage-map.md'}")
    print(f"Legacy aichat dumps: {n_legacy}")
    if not args.skip_specstory:
        print(f"SpecStory copies: {n_spec} -> {output_dir / 'specstory-md-copies'}")
    print(f"README: {output_dir / 'README.txt'}")


if __name__ == "__main__":
    main()

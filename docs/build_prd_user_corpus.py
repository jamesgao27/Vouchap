#!/usr/bin/env python3
"""Rebuild PRD Appendix A + Section 9 with improved prompt classification."""
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = Path(__file__).resolve().parent
CHAT = ROOT / "Vouchap_Full_Chats_Merged.md"
SCRAPE = ROOT / "Cursor_Deep_Scrape.txt"
APPENDIX_PROMPTS = DOCS / "PRD-Appendix-B-User-Prompts-Full-Corpus.md"
SECTION_9 = DOCS / "PRD-Section9-User-Driven-Requirements.md"


def clean_user_body(s: str) -> str:
    s = s.strip()
    if not s:
        return ""
    if "entry.bundle?" in s or "Download the React DevTools" in s:
        lines = s.splitlines()
        kept = []
        for line in lines:
            if "entry.bundle?" in line and "platform=web" in line:
                break
            if line.strip().startswith("entry.bundle?"):
                break
            kept.append(line)
        s = "\n".join(kept).strip()
    s = re.sub(r"\n{4,}", "\n\n\n", s)
    return s.strip()


def extract_chat(path: Path):
    raw, buf, in_user = [], [], False
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            if line.rstrip("\n") == "## User":
                if in_user and buf:
                    s = "".join(buf).strip()
                    if len(s) > 3:
                        raw.append(s)
                buf, in_user = [], True
                continue
            if in_user:
                if line.startswith("## "):
                    s = "".join(buf).strip()
                    if len(s) > 3:
                        raw.append(s)
                    buf, in_user = [], False
                else:
                    buf.append(line)
    if in_user and buf:
        s = "".join(buf).strip()
        if len(s) > 3:
            raw.append(s)
    return [clean_user_body(s) for s in raw if len(clean_user_body(s)) > 3]


def extract_scrape(path: Path):
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8", errors="replace")
    found = []
    for m in re.finditer(r'"textDescription"\s*:\s*"((?:[^"\\]|\\.)*)"', text):
        found.append(json.loads('"' + m.group(1) + '"').strip())
    for m in re.finditer(
        r'\{"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"commandType"\s*:\s*\d+\}', text
    ):
        try:
            found.append(json.loads('"' + m.group(1) + '"').strip())
        except json.JSONDecodeError:
            pass
    return [x for x in found if len(x) > 4]


def classify(body: str) -> str:
    tl = body.lower()
    # Log / tooling noise → engineering
    if "<terminal_selection" in body or "android bundled" in tl[:800]:
        return "bugfix_generic"

    # Out-of-tree product ideas (keep traceability, not Vouchap-app scope)
    if any(
        x in tl
        for x in ("project map", "mind map", "workmap", "react flow", "yjs", "vouchap-web项目")
    ):
        return "general_other"

    def has_firm_crm_context() -> bool:
        if any(
            x in body or x in tl
            for x in (
                "firm/",
                "/firm/",
                "open_invite",
                "open invite",
                "add_client",
                "service catalog",
                "preset",
                "invitee",
                "firm_get_client",
                "事务所",
                "member-clients",
                "firm.clients",
            )
        ):
            return True
        if "engagement" in tl and ("firm" in tl or "sku" in tl or "client" in tl):
            return True
        if "客户" in body and any(x in tl for x in ("firm", "invite", "engagement", "sku")):
            return True
        return False

    # Tax filing todo row UI (narrow)
    todo_ui_kw = (
        "depends on",
        "depends_on",
        "状态标签",
        "责任方",
        "taxfilingtodos",
        "文件计数",
        "merge icon",
        "taskdeps",
        "编号标签",
        "pending状态",
        "cancel状态",
        "depends on区",
        "depends on与",
    )
    if any(k.lower() in tl or k in body for k in todo_ui_kw):
        return "tax_filing_todos_ui"

    # AI attach / task mismatch
    if any(
        k in body
        for k in ("报税附件", "ai识别", "多文件", "task关联", "关联错位", "名称识别正确")
    ):
        return "tax_filing_ai_attach"

    # Invites & email landing
    if any(
        k in body or k.lower() in tl
        for k in (
            "落地页",
            "client-join",
            "邮件模板",
            "重设密码",
            "注册确认",
            "方案二",
            "自动跳转",
            "手动选择",
            "email_change",
            "vouchap.com",
            "smtp",
            "深链",
            "确认邮件",
        )
    ):
        return "invites_landing_email"

    if has_firm_crm_context():
        return "firm_crm_clients_engagements"

    if any(k in body for k in ("权限", "permission", "order_managers", "角色")):
        return "permissions_roles"

    if any(
        k in body
        for k in ("select_space", "踢出", "移除", "member邀请", "登录后", "依次查询", "无当前空间")
    ):
        return "space_login_routing"

    if "vouchap-website" in body.lower() or "vercel" in tl:
        return "marketing_website"

    if any(
        k in body
        for k in (
            "小票",
            "绿色圆标",
            "九宫格",
            "微信",
            "chat-to-log",
            "删除小票",
            "供应商",
            "相机",
            "录音",
            "语音录入",
        )
    ):
        return "receipts_voice_chat_ui"

    if any(
        k in body
        for k in ("票面", "采购日期", "提交时间", "临时文件", "只存一份", "storage", "冗余")
    ):
        return "receipt_date_storage"

    if any(
        k in body.lower()
        for k in ("migration", "invitee_clients", "clients_clients", "合并表", "rls")
    ):
        return "data_model_migrations"

    if any(
        k in body.lower()
        for k in ("cocoapod", "pod install", "版本号", "google play", "testflight", "apk", "构建")
    ):
        return "build_release"

    if ("移动端" in body and "web" in body.lower()) or any(
        k in body for k in ("表格视图", "进度条", "绿色系", "浮窗", "12行", "only web")
    ):
        return "mobile_web_parity"

    if any(x in tl for x in ("please fix", "fix this error", "error in", "报错")):
        return "bugfix_generic"

    if "请探索" in body or "请彻底探索" in body or "subagent" in tl:
        return "explore_codebase"

    return "general_other"


MAP_PRD = {
    "tax_filing_todos_ui": "**PRD:** `§4.6` Todo 树、Depends on、状态与责任方标签（`TaxFilingTodosView` 等）。",
    "tax_filing_ai_attach": "**PRD:** `§4.6` 报税附件 AI 识别、多文件与 task 对齐、预览。",
    "invites_landing_email": "**PRD:** `§3` 营销落地页；`§4.3` 认证/setup；`§4.9` 邀请邮件。",
    "firm_crm_clients_engagements": "**PRD:** `§4.7` Firm — Clients、Engagements、Catalog、邀请。",
    "permissions_roles": "**PRD:** `§4.7.7` 成员权限与 order managers。",
    "space_login_routing": "**PRD:** `§4.3–4.4` 登录、空间切换、邀请与踢出场景。",
    "marketing_website": "**PRD:** `§3` vouchap-website。",
    "receipts_voice_chat_ui": "**PRD:** `§4.5.2–4.8` 小票列表与录入方式、聊天录入、删除与关联清理。",
    "receipt_date_storage": "**PRD:** `§4.5.2` 小票日期忠实性；`§5.3` Storage。",
    "data_model_migrations": "**PRD:** `§5` 数据模型、合并与 RLS。",
    "build_release": "**PRD:** `§6` 构建与发布。",
    "mobile_web_parity": "**PRD:** Web/Mobile 一致性与专项布局。",
    "bugfix_generic": "**PRD:** 工程排错 / 终端日志类。",
    "explore_codebase": "**PRD:** 代码探索请求。",
    "general_other": "**PRD:** 其他截图迭代、泛化交互与未归类指令。",
}

SUMMARY = {
    "tax_filing_todos_ui": (
        "报税 Todo 行布局：状态/文件列/Depends on 间距、chip 与 X、merge、责任方标签与 pending/cancel 规则等。"
    ),
    "tax_filing_ai_attach": "多附件 AI 识别与同 task 对齐、避免错位。",
    "invites_landing_email": "邮件多场景落地、手动跳转、模板与域名、与 App/Web 握手。",
    "firm_crm_clients_engagements": "Firm 客户、Engagement、邀请、SKU、公开链与表单。",
    "permissions_roles": "成员权限与角色。",
    "space_login_routing": "登录后空间与邀请处理、踢出恢复。",
    "marketing_website": "官网与配置。",
    "receipts_voice_chat_ui": "小票列表类型图标、聊天录入、删除与关联数据清理。",
    "receipt_date_storage": "日期忠实、列表时间、存储与临时文件。",
    "data_model_migrations": "表合并与策略。",
    "build_release": "构建、版本与商店。",
    "mobile_web_parity": "双端视觉与交互对齐。",
    "bugfix_generic": "明确错误与日志。",
    "explore_codebase": "仓库探索。",
    "general_other": "其余全部未归入上述标签的指令（体量最大）。",
}


def uniq_bodies():
    parts = extract_chat(CHAT) + extract_scrape(SCRAPE)
    by_h = {hashlib.sha256(b.encode()).hexdigest(): b for b in parts}
    return list(by_h.values())


def write_appendix_a(records: list[str], bucket_fn):
    lines = [
        "# PRD Appendix A — Full user & composer instruction corpus\n\n",
        "Each entry: one deduplicated instruction. Tag in heading is the automatic topic.\n",
        "Sources: `Vouchap_Full_Chats_Merged.md`, `Cursor_Deep_Scrape.txt`. ",
        "Web console bundle pastes trimmed to human prefix.\n\n---\n\n",
    ]
    for idx, body in enumerate(
        sorted(records, key=lambda x: (bucket_fn(x), x[:50])), start=1
    ):
        tag = bucket_fn(body)
        lines.append(f"### A-{idx:04d} [{tag}]\n\n{body}\n\n---\n\n")
    APPENDIX_PROMPTS.write_text("".join(lines), encoding="utf-8")


def write_section_9(bucketed: dict[str, list[str]]):
    order = [
        "tax_filing_todos_ui",
        "tax_filing_ai_attach",
        "firm_crm_clients_engagements",
        "invites_landing_email",
        "permissions_roles",
        "space_login_routing",
        "receipts_voice_chat_ui",
        "receipt_date_storage",
        "mobile_web_parity",
        "marketing_website",
        "data_model_migrations",
        "build_release",
        "bugfix_generic",
        "explore_codebase",
        "general_other",
    ]
    lines = [
        "# Section 9 — User-driven requirements (from full prompt corpus)\n\n",
        "由导出对话与 Composer 摘要自动归类；控制台日志块归入 `bugfix_generic`。\n\n",
        "**Unique instructions:** "
        + str(sum(len(v) for v in bucketed.values()))
        + "  \n",
        "**Verbatim numbered corpus:** `docs/PRD-Appendix-A-User-Prompts-Full-Corpus.md`（搜索 `[tag]`）。\n\n---\n\n",
    ]

    def bullet(body: str) -> str:
        body = body.replace("\r\n", "\n").strip()
        if len(body) > 5000:
            return body[:5000] + "\n\n… *(truncated)*"
        return body

    for i, bucket in enumerate(order, start=1):
        items = bucketed.get(bucket, [])
        if not items:
            continue
        lines.append(f"### 9.{i} `{bucket}` ({len(items)})\n\n")
        lines.append(MAP_PRD.get(bucket, "") + "\n\n")
        lines.append("**Summary:** " + SUMMARY.get(bucket, "") + "\n\n")
        lines.append("**Instructions (deduplicated):**\n\n")
        if bucket == "general_other":
            lines.append(
                "_本类体量最大：下列为每条前 **260 字** 摘要；**全文**见 Appendix A 同标签条目。_\n\n"
            )
            for j, body in enumerate(items, 1):
                b = bullet(body)
                if len(b) > 260:
                    b = b[:260] + "…"
                lines.append(f"{j}. {b}\n\n")
        else:
            for j, body in enumerate(items, 1):
                lines.append(f"{j}. {bullet(body)}\n\n")
        lines.append("\n---\n\n")

    SECTION_9.write_text("".join(lines), encoding="utf-8")


def main():
    records = uniq_bodies()
    bucketed = defaultdict(list)
    for b in records:
        bucketed[classify(b)].append(b)
    for k in bucketed:
        bucketed[k].sort()

    write_appendix_a(records, classify)
    write_section_9(bucketed)

    print("records", len(records))
    for k in sorted(bucketed.keys(), key=lambda x: -len(bucketed[x])):
        print(k, len(bucketed[k]))
    print("Wrote", APPENDIX_PROMPTS, APPENDIX_PROMPTS.stat().st_size)
    print("Wrote", SECTION_9, SECTION_9.stat().st_size)


if __name__ == "__main__":
    main()

"""Index a Claude Code transcript by turn, for the for-your-eyes mod.

Reads the session's .jsonl transcript and prints one JSON object:
  turns: one per turn, {id, head, final, ms, items}
    items: what the turn shows before its answer (text, thinking and tool rows, by id)
    final: the turn's last text row, its answer
    head:  the first text or tool item, where the "Worked for" line is drawn
    ms:    how long the turn ran
  msgs: API message id -> its text rows in order (the desktop app names a text block
        `<API message id>-t<n>`)
"""

import json
import sys
from datetime import datetime


def rows_in(path):
    """Ignore incomplete writes and non-object metadata rows."""
    with open(path, encoding="utf-8") as file:
        for line in file:
            try:
                row = json.loads(line)
            except ValueError:
                continue
            if isinstance(row, dict):
                yield row


def message_rows(path, message_id):
    """One UUID per text block, matching Desktop's -t<n> numbering."""
    rows = []
    for row in rows_in(path):
        message = row.get("message") or {}
        if row.get("isSidechain") or not isinstance(message, dict) or message.get("id") != message_id:
            continue
        if not isinstance(row.get("uuid"), str):
            continue
        content = message.get("content")
        if isinstance(content, list):
            rows.extend(row["uuid"] for block in content
                        if isinstance(block, dict) and block.get("type") == "text"
                        and str(block.get("text", "")).strip())
    return rows


def stamp(row):
    try:
        return datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00")).timestamp()
    except (KeyError, ValueError, AttributeError):
        return None


def is_prompt(row):
    """A row that starts a turn: something the person (or a notification) sent, not a tool result."""
    if row.get("type") != "user" or row.get("isMeta") or row.get("isSidechain"):
        return False
    content = (row.get("message") or {}).get("content")
    if isinstance(content, str):
        return content.strip() != ""
    if isinstance(content, list):
        kinds = {block.get("type") for block in content if isinstance(block, dict)}
        return "tool_result" not in kinds and bool(kinds & {"text", "image", "document"})
    return False


def main(path):
    turns, msgs = [], {}
    turn = None

    def close():
        if turn is None:
            return
        texts = [item for kind, item in turn["items"] if kind == "text"]
        final = texts[-1] if texts else None
        shown = [(kind, item) for kind, item in turn["items"] if item != final]
        head = next((item for kind, item in shown if kind != "thinking"), None)
        start, end = turn["start"], turn["end"]
        turns.append({
            "id": turn["id"],
            "head": head,
            "final": final,
            "ms": round((end - start) * 1000) if start is not None and end is not None else None,
            "items": [item for _, item in shown],
        })

    for row in rows_in(path):
        if is_prompt(row):
            close()
            turn = {"id": row.get("uuid"), "items": [], "start": stamp(row), "end": stamp(row)}
            continue
        if turn is None or row.get("isSidechain") or row.get("type") not in ("assistant", "user"):
            continue
        turn["end"] = stamp(row) or turn["end"]
        if row.get("type") != "assistant" or not isinstance(row.get("uuid"), str):
            continue
        message = row.get("message") or {}
        for block in message.get("content") or []:
            if not isinstance(block, dict):
                continue
            kind = block.get("type", "")
            if kind == "text" and str(block.get("text", "")).strip():
                turn["items"].append(("text", row.get("uuid")))
                if message.get("id"):
                    msgs.setdefault(message["id"], []).append(row.get("uuid"))
            elif kind in ("thinking", "redacted_thinking"):
                turn["items"].append(("thinking", row.get("uuid")))
            elif kind.endswith("tool_use") and block.get("id"):
                turn["items"].append(("tool", block["id"]))
    close()
    json.dump({"turns": turns, "msgs": msgs}, sys.stdout, separators=(",", ":"))


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[2] == "--message":
        json.dump(message_rows(sys.argv[1], sys.argv[3]), sys.stdout)
    else:
        main(sys.argv[1])

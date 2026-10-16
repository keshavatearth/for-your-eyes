import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location("transcript_index", Path(__file__).parents[1] / "hooks" / "index.py")
index = importlib.util.module_from_spec(spec)
spec.loader.exec_module(index)


class TranscriptIndexTests(unittest.TestCase):
    def write_transcript(self, path, compact=False):
        rows = [
            {"type": "user", "uuid": "prompt", "message": {"content": "Go"}},
            {"type": "assistant", "uuid": "update", "message": {"id": "msg_A", "content": [
                {"type": "text", "text": "Checking."},
                {"type": "tool_use", "id": "tool-1"},
            ]}},
            {"type": "user", "uuid": "tool-result", "message": {"content": [
                {"type": "tool_result", "tool_use_id": "tool-1", "content": "Result"},
            ]}},
            {"type": "assistant", "uuid": "final", "message": {"id": "msg_B", "content": [
                {"type": "thinking", "thinking": "Thought"},
                {"type": "text", "text": "First block."},
                {"type": "text", "text": "Second block."},
                {"type": "text", "text": "  "},
            ]}},
            {"type": "assistant", "uuid": "sub", "isSidechain": True, "message": {
                "id": "msg_B", "content": [{"type": "text", "text": "Subagent."}]}},
            {"type": "assistant", "message": {"id": "msg_B", "content": [
                {"type": "text", "text": "Missing UUID."}]}},
        ]
        separators = (",", ":") if compact else None
        path.write_text("\n".join(json.dumps(row, separators=separators) for row in rows) + '\nnull\n{"partial":', encoding="utf-8")

    def test_message_lookup_supports_json_spacing_and_multiple_text_blocks(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "transcript.jsonl"
            for compact in (False, True):
                with self.subTest(compact=compact):
                    self.write_transcript(path, compact)
                    self.assertEqual(index.message_rows(path, "msg_A"), ["update"])
                    self.assertEqual(index.message_rows(path, "msg_B"), ["final", "final"])
                    self.assertEqual(index.message_rows(path, "msg_MISSING"), [])

    def test_tool_results_do_not_start_turns_and_subagents_do_not_replace_answers(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "transcript.jsonl"
            self.write_transcript(path)
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                index.main(path)
            result = json.loads(output.getvalue())
            self.assertEqual(len(result["turns"]), 1)
            self.assertEqual(result["turns"][0]["final"], "final")
            self.assertEqual(result["msgs"]["msg_B"], ["final", "final"])


if __name__ == "__main__":
    unittest.main()

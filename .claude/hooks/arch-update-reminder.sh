#!/bin/bash
# After editing an architecture-relevant file, reminds Claude to update architecture.md.
# Triggered on PostToolUse for Write|Edit tool calls.
export HOOK_INPUT
HOOK_INPUT=$(cat)
python3 << 'EOF'
import json, os
data = json.loads(os.environ.get("HOOK_INPUT", "{}"))
fp = data.get("tool_input", {}).get("file_path", "")
patterns = ["src/lib/", "src/app/api/", "src/middleware.ts", "src/auth.ts", "mcp-server/src/"]
if any(p in fp for p in patterns):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": (
                f"REMINDER: {fp} is covered by architecture.md. "
                "If this change adds/removes/renames an API route, type field, DB table/column, "
                "env var, auth rule, or key pattern — update architecture.md now before finishing."
            )
        }
    }))
EOF

#!/bin/bash
# Injects architecture.md into Claude's context at session start.
# Prevents Claude from needing to scan the codebase at the beginning of each session.
ARCH="/Users/eneskis/Documents/Projects/Recgon/architecture.md"
[ -f "$ARCH" ] || exit 0
python3 - "$ARCH" << 'EOF'
import json, sys
content = open(sys.argv[1]).read()
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": "ARCHITECTURE REFERENCE — read this instead of scanning the codebase:\n\n" + content
    }
}))
EOF

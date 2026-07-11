#!/usr/bin/env python3
"""CI wrapper for verify-predictions.yml — delegates to track_predictions.py verify."""
import sys, os

# Find track_predictions.py (in scripts/ alongside this file)
_script_dir = os.path.dirname(os.path.abspath(__file__))
_tracker = os.path.join(_script_dir, "track_predictions.py")

if os.path.exists(_tracker):
    os.execvp(sys.executable, [sys.executable, _tracker, "verify"])
else:
    print(f"[ERROR] track_predictions.py not found at {_tracker}")
    sys.exit(1)

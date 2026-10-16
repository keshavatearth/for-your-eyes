#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
claude plugin validate .
claude plugin test .
python3 -m unittest discover -s tests -p 'test_*.py' -v

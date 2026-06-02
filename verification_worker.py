#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Standalone process entrypoint for scenario verification tasks."""

from __future__ import annotations

import argparse
import os
import sys
import traceback
from pathlib import Path

os.environ.setdefault("ESTORE_OPT_WORKER", "1")

from server import json_safe, normalize_compute_config, read_json, run_scheme_verification, scheme_params_path, write_json  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run one estore scenario verification task")
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--scheme", required=True)
    parser.add_argument("--config-file", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--result-json", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output_dir = Path(args.output_dir)
    result_path = Path(args.result_json)
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
        config = normalize_compute_config(read_json(Path(args.config_file), {}) or {})
        payload = run_scheme_verification(scheme_params_path(args.scheme), config, output_dir)
        write_json(result_path, {"ok": True, "task_id": args.task_id, "payload": json_safe(payload)})
        return 0
    except BaseException as exc:
        write_json(
            result_path,
            {
                "ok": False,
                "task_id": args.task_id,
                "message": str(exc),
                "traceback": traceback.format_exc(),
            },
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

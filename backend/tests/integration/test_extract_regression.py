"""Regression tests for ``POST /contracts/extract`` (P4, deploy blocker).

The Gemini key is unset so the deterministic regex fallback runs; that path still
reaches every line of the router, including the success log — which used to crash
the request with ``KeyError: Attempt to overwrite 'filename' in LogRecord``
(a reserved LogRecord attribute passed through ``logging.extra``).

The root logger is forced to ``INFO`` first: under pytest's default (``WARNING``)
the ``logger.info`` call short-circuits at ``isEnabledFor`` and the bug is
invisible, which is exactly how it reached the deployment.
"""

from __future__ import annotations

import logging
import os
import uuid

os.environ.pop("GEMINI_API_KEY", None)

from fastapi.testclient import TestClient  # noqa: E402

from backend.app.db import Base, engine  # noqa: E402

DEMOS = {"X-Demo-Key": "test-demo-key-0123456789abcdef"}

PARSEABLE_CONTRACT = """# Master Services Agreement

This Services Agreement is made between Apex Design Studio and Northwind Trading ("Client").
The Client's payer address for PayPal payments is ap-expay@northwind-trading.example.
Currency of record for all invoices is USD.

• Milestone MS-1 - "Discovery Sprint": delivery of the discovery report (MS-1) for $1,000.00, due 2026-12-15.
• Milestone MS-2 - "Build Phase": delivery of the production release (MS-2) for $2,000.00, due 2027-01-15.

A late fee of 5 percent applies to amounts unpaid more than 30 calendar days past the due date.
Partial payments are permitted.
"""


def test_extract_succeeds_and_survives_success_log() -> None:
    logging.getLogger().setLevel(logging.INFO)  # make the success log actually emit
    from backend.app.main import app

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestClient(app) as test_client:
        response = test_client.post(
            "/api/v1/contracts/extract",
            headers=DEMOS,
            files={
                "file": (
                    f"regression-{uuid.uuid4().hex}.txt",
                    PARSEABLE_CONTRACT.encode("utf-8"),
                    "text/plain",
                )
            },
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["status"] == "DRAFT"
        assert body["source_filename"].endswith(".txt")
        milestones = body["extraction"]["milestones"]
        assert [m["milestone_code"] for m in milestones] == ["MS-1", "MS-2"]
        assert milestones[0]["expected_amount"] == "1000.00"
        assert milestones[0]["due_date"] == "2026-12-15"
        assert body["extraction"]["client_name"] == "Northwind Trading"

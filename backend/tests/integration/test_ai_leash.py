"""Tests for P2's ``app.ai.leash`` (Interface 3), owned by P4 pending P2 review.

Covers the three dynamic-import functions Leash consumes:
- ``compile_leash_policy`` — template path (no key), LLM path (fake genai),
  unsound-ALLOW filtering, and the router no longer answering 501.
- ``explain_decision`` — the R5 keyword contract (``use_llm``) and the
  no-LLM template sentence.
- ``map_timesheet_columns`` — LLM proposal validation and the no-key raise.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend.app.db import Base, engine

DEMOS = {"X-Demo-Key": "test-demo-key-0123456789abcdef"}

RULES_TEXT = (
    "Send correction invoices automatically when they are $250.00 or less, "
    "extraction confidence at least 90 percent, and the penalty clause is quoted. "
    "Anything bigger, hold for my approval."
)


@pytest.fixture(autouse=True)
def _env_and_tables(monkeypatch: pytest.MonkeyPatch) -> Any:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def client() -> Any:
    from backend.app.main import app

    with TestClient(app) as test_client:
        yield test_client


class FakeGenaiText:
    """Stands in for ``google.genai.Client`` returning a fixed text/JSON answer."""

    def __init__(self, answer: str) -> None:
        self._answer = answer
        self.aio = SimpleNamespace(models=SimpleNamespace(generate_content=self._gen))

    async def _gen(self, *, model: str, contents: str, config: Any) -> Any:
        return SimpleNamespace(text=self._answer)


# --- compile: deterministic template (no GEMINI key) -----------------------


def test_template_compile_builds_a_sound_policy() -> None:
    from backend.app.ai.leash import compile_leash_policy

    import asyncio

    policy = asyncio.run(compile_leash_policy(RULES_TEXT))
    allow = [r for r in policy.rules if r.outcome.value == "ALLOW"]
    assert len(allow) == 1
    assert allow[0].id == "C-1"
    assert allow[0].applies_to.value == "SEND_REMEDIATION_INVOICE"
    assert allow[0].when == {
        "amount_lte": "250.00",
        "clause_quote_present": True,
        "confidence_gte": 0.9,
    }
    assert any(r.outcome.value == "ASK" for r in policy.rules)


def test_template_compile_without_guards_never_allows() -> None:
    from backend.app.ai.leash import compile_leash_policy

    import asyncio

    policy = asyncio.run(compile_leash_policy("Send everything on my own."))
    assert not [r for r in policy.rules if r.outcome.value == "ALLOW"]
    assert any(r.outcome.value == "ASK" for r in policy.rules)


def test_router_compile_endpoint_no_longer_answers_501(client: Any) -> None:
    response = client.post(
        "/api/v1/leash/policy/compile",
        headers=DEMOS,
        json={"text": RULES_TEXT},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["policy"]["version"] >= 1
    outcomes = {rule["outcome"] for rule in body["policy"]["rules"]}
    assert "ALLOW" in outcomes
    assert any(rule["id"] == "C-1" for rule in body["policy"]["rules"])


# --- compile: LLM path with a fake genai client ----------------------------


def test_llm_compile_drops_unknown_conditions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from backend.app.ai.leash import compile_leash_policy

    draft = {
        "rules": [
            {
                "id": "C-1",
                "applies_to": "SEND_REMEDIATION_INVOICE",
                "outcome": "ALLOW",
                "when": {
                    "amount_lte": "250",
                    "confidence_gte": "0.95",
                    "mood_of_the_day": "good",  # unknown: must be dropped
                },
                "source_text": "auto-send under 250 at 95% confidence",
            },
            {
                "id": "C-2",
                "applies_to": "SEND_PAYROLL_BATCH",  # payroll ALLOW is unsound
                "outcome": "ALLOW",
                "when": {},
                "source_text": "allow payroll",
            },
        ],
        "payroll_margin_limit_pct": 150,  # out of range -> default 80
        "email_change_window_days": 7,
    }
    monkeypatch.setattr(
        "google.genai.Client",
        lambda api_key: FakeGenaiText(json.dumps(draft)),
    )
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    import asyncio

    policy = asyncio.run(compile_leash_policy(RULES_TEXT))
    assert [r.id for r in policy.rules] == ["C-1"]
    assert policy.rules[0].when["amount_lte"] == "250.00"
    assert policy.rules[0].when["confidence_gte"] == 0.95
    assert "mood_of_the_day" not in policy.rules[0].when
    assert policy.payroll_margin_limit_pct == __import__("decimal").Decimal("80.00")


# --- explain_decision -------------------------------------------------------


def test_explain_without_llm_is_short_and_deterministic() -> None:
    from backend.app.ai.leash import explain_decision
    from backend.app.schemas.contracts import GuardAction, LeashDecision

    import asyncio

    text = asyncio.run(
        explain_decision(
            GuardAction.SEND_PAYROLL_BATCH,
            LeashDecision.ASK,
            ["PR-04"],
            {"amount": "500.00"},
            use_llm=False,
        )
    )
    assert 0 < len(text) <= 200
    assert "PR-04" in text


def test_explain_accepts_the_use_llm_keyword_introspection() -> None:
    """R5: P5's loader rejects explainers without the ``use_llm`` keyword."""
    import inspect

    from backend.app.ai.leash import explain_decision
    from backend.app.leash.service import _matches_contract

    assert inspect.iscoroutinefunction(explain_decision)
    assert _matches_contract(explain_decision)


# --- map_timesheet_columns --------------------------------------------------


def test_mapping_without_a_key_raises_and_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    from backend.app.ai.leash import map_timesheet_columns

    import asyncio

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(RuntimeError):
        asyncio.run(map_timesheet_columns(["Who", "Hours"], [["x", "1"]]))


def test_mapping_llm_path_returns_a_valid_proposal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from backend.app.ai.leash import map_timesheet_columns

    draft = {
        "mapping": {"Who": "member", "Hours": "hours", "When": "work_date"},
        "confidence": {"Who": 0.9, "Hours": 0.8, "When": 0.7},
    }
    monkeypatch.setattr(
        "google.genai.Client",
        lambda api_key: FakeGenaiText(json.dumps(draft)),
    )
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    import asyncio

    proposal = asyncio.run(
        map_timesheet_columns(["Who", "Hours", "When"], [["A", "1", "2026-11-01"]])
    )
    assert proposal.mapping == {"Who": "member", "Hours": "hours", "When": "work_date"}
    assert proposal.confidence["Who"] == 0.9

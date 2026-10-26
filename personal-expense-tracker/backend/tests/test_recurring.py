from datetime import date, timedelta

import pytest


def signup(client, email="recurring@example.com"):
    return client.post("/api/auth/signup", json={
        "name": "Recurring User",
        "email": email,
        "password": "password123",
    })


def recurring_payload(**overrides):
    today = date.today()
    return {
        "name": "Streaming service",
        "amount": 299,
        "category": "Entertainment",
        "frequency": "monthly",
        "start_date": today.isoformat(),
        "next_due_date": today.isoformat(),
        "notes": "Family plan",
        "is_active": True,
        **overrides,
    }


def test_recurring_routes_require_authentication(client):
    assert client.get("/api/recurring").status_code == 401
    assert client.post("/api/recurring", json=recurring_payload()).status_code == 401
    assert client.put("/api/recurring/1", json=recurring_payload()).status_code == 401
    assert client.delete("/api/recurring/1").status_code == 401


def test_recurring_crud_does_not_create_expenses(client):
    assert signup(client).status_code == 201

    created = client.post("/api/recurring", json=recurring_payload())

    assert created.status_code == 201
    item = created.json["recurring_expense"]
    assert item["name"] == "Streaming service"
    assert item["amount"] == 299
    assert item["is_active"] is True
    assert client.get("/api/expenses").json["expenses"] == []

    updated_payload = recurring_payload(
        name="Updated streaming service",
        amount=349.5,
        frequency="yearly",
        is_active=False,
    )
    updated = client.put(f"/api/recurring/{item['id']}", json=updated_payload)

    assert updated.status_code == 200
    assert updated.json["recurring_expense"]["name"] == "Updated streaming service"
    assert updated.json["recurring_expense"]["amount"] == 349.5
    assert updated.json["recurring_expense"]["frequency"] == "yearly"
    assert updated.json["recurring_expense"]["is_active"] is False
    assert client.get("/api/expenses").json["expenses"] == []

    listed = client.get("/api/recurring")
    assert len(listed.json["recurring_expenses"]) == 1
    assert listed.json["summary"]["monthly_estimate"] == 0

    deleted = client.delete(f"/api/recurring/{item['id']}")
    assert deleted.status_code == 200
    assert client.get("/api/recurring").json["recurring_expenses"] == []
    assert client.get("/api/expenses").json["expenses"] == []


def test_recurring_monthly_estimates_cover_each_frequency(client):
    assert signup(client).status_code == 201
    today = date.today()
    due_soon = (today + timedelta(days=10)).isoformat()
    for payload in (
        recurring_payload(name="Weekly class", amount=100, frequency="weekly", next_due_date=due_soon),
        recurring_payload(name="Monthly plan", amount=250, frequency="monthly", next_due_date=due_soon),
        recurring_payload(name="Annual membership", amount=1200, frequency="yearly", next_due_date=due_soon),
    ):
        assert client.post("/api/recurring", json=payload).status_code == 201

    response = client.get("/api/recurring")

    assert response.status_code == 200
    assert response.json["summary"]["monthly_estimate"] == 783.33
    assert response.json["summary"]["upcoming_count"] == 3
    assert response.json["summary"]["upcoming_total"] == 1550
    assert len(response.json["recurring_expenses"]) == 3


def test_recurring_summary_excludes_paused_and_out_of_window_items(client):
    assert signup(client).status_code == 201
    today = date.today()
    assert client.post("/api/recurring", json=recurring_payload(
        amount=100,
        next_due_date=(today + timedelta(days=31)).isoformat(),
    )).status_code == 201
    assert client.post("/api/recurring", json=recurring_payload(
        name="Paused plan",
        amount=400,
        is_active=False,
        next_due_date=today.isoformat(),
    )).status_code == 201
    assert client.post("/api/recurring", json=recurring_payload(
        name="Due today",
        amount=50,
        next_due_date=today.isoformat(),
    )).status_code == 201

    summary = client.get("/api/recurring").json["summary"]

    assert summary["monthly_estimate"] == 150
    assert summary["upcoming_count"] == 1
    assert summary["upcoming_total"] == 50


@pytest.mark.parametrize("overrides", [
    {"name": ""},
    {"name": "  "},
    {"name": "x" * 101},
    {"amount": True},
    {"amount": 0},
    {"amount": -1},
    {"amount": 0.001},
    {"amount": float("inf")},
    {"amount": 100000001},
    {"category": "Unknown"},
    {"frequency": "daily"},
    {"start_date": "2026-02-30"},
    {"start_date": "26-02-01"},
    {"next_due_date": "not-a-date"},
    {"notes": "x" * 241},
    {"notes": 10},
    {"is_active": "yes"},
])
def test_recurring_validation_rejects_invalid_inputs(client, overrides):
    assert signup(client).status_code == 201

    response = client.post("/api/recurring", json=recurring_payload(**overrides))

    assert response.status_code == 400
    assert response.json["error"]


def test_recurring_next_due_date_cannot_precede_start_date(client):
    assert signup(client).status_code == 201
    today = date.today()

    response = client.post("/api/recurring", json=recurring_payload(
        start_date=(today + timedelta(days=1)).isoformat(),
        next_due_date=today.isoformat(),
    ))

    assert response.status_code == 400
    assert "before the start date" in response.json["error"]


def test_recurring_update_rejects_invalid_payload_without_changing_item(client):
    assert signup(client).status_code == 201
    created = client.post("/api/recurring", json=recurring_payload())
    item_id = created.json["recurring_expense"]["id"]

    response = client.put(f"/api/recurring/{item_id}", json=recurring_payload(amount=-5))

    assert response.status_code == 400
    assert client.get("/api/recurring").json["recurring_expenses"][0]["amount"] == 299


def test_recurring_items_are_isolated_and_other_owners_cannot_mutate(client):
    assert signup(client).status_code == 201
    created = client.post("/api/recurring", json=recurring_payload())
    item_id = created.json["recurring_expense"]["id"]
    client.post("/api/auth/logout")
    assert signup(client, "other@example.com").status_code == 201

    assert client.get("/api/recurring").json["recurring_expenses"] == []
    assert client.put(f"/api/recurring/{item_id}", json=recurring_payload(name="Hijack")).status_code == 404
    assert client.delete(f"/api/recurring/{item_id}").status_code == 404

    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={
        "email": "recurring@example.com",
        "password": "password123",
    }).status_code == 200
    items = client.get("/api/recurring").json["recurring_expenses"]
    assert len(items) == 1
    assert items[0]["name"] == "Streaming service"

from datetime import date

import pytest


def signup(client, email="buyer@example.com"):
    return client.post("/api/auth/signup", json={
        "name": "Buyer",
        "email": email,
        "password": "password123",
    })


def add_expense(client, amount, category):
    return client.post("/api/expenses", json={
        "amount": amount,
        "category": category,
        "date": date.today().isoformat(),
        "description": "Existing transaction",
        "payment_method": "Card",
    })


def add_budget(client, category, amount):
    return client.post("/api/budgets", json={
        "amount": amount,
        "category": category,
        "month": date.today().strftime("%Y-%m"),
    })


def simulation_payload(**overrides):
    return {
        "amount": 150,
        "category": "Food",
        "month": date.today().strftime("%Y-%m"),
        "name": "Headphones",
        **overrides,
    }


def test_purchase_simulation_requires_authentication(client):
    response = client.post("/api/budgets/simulate", json=simulation_payload())

    assert response.status_code == 401
    assert response.json["error"] == "Authentication required"


def test_purchase_simulation_calculates_category_and_overall_impact_without_saving(client):
    assert signup(client).status_code == 201
    assert add_expense(client, 70, "Food").status_code == 201
    assert add_expense(client, 110, "Transport").status_code == 201
    assert add_budget(client, "Food", 200).status_code == 201
    assert add_budget(client, "Overall", 500).status_code == 201
    expenses_before = client.get("/api/expenses").json["expenses"]

    response = client.post("/api/budgets/simulate", json=simulation_payload())

    assert response.status_code == 200
    assert response.json == {
        "purchase_name": "Headphones",
        "purchase_amount": 150,
        "category": "Food",
        "month": date.today().strftime("%Y-%m"),
        "category_impact": {
            "budget": 200,
            "spent_before": 70,
            "remaining_before": 130,
            "remaining_after": -20,
            "would_exceed": True,
        },
        "overall_impact": {
            "budget": 500,
            "spent_before": 180,
            "remaining_before": 320,
            "remaining_after": 170,
            "would_exceed": False,
        },
    }
    assert client.get("/api/expenses").json["expenses"] == expenses_before


def test_purchase_simulation_returns_spending_without_category_budget(client):
    assert signup(client).status_code == 201
    assert add_expense(client, 25.5, "Food").status_code == 201
    assert add_budget(client, "Overall", 300).status_code == 201

    response = client.post("/api/budgets/simulate", json=simulation_payload(amount=10))

    assert response.status_code == 200
    assert response.json["category_impact"] == {
        "budget": None,
        "spent_before": 25.5,
        "remaining_before": None,
        "remaining_after": None,
        "would_exceed": None,
    }
    assert response.json["overall_impact"]["remaining_before"] == 274.5
    assert response.json["overall_impact"]["remaining_after"] == 264.5


def test_purchase_simulation_reports_missing_budgets_and_zero_spend(client):
    assert signup(client).status_code == 201

    response = client.post("/api/budgets/simulate", json=simulation_payload(name=""))

    assert response.status_code == 200
    assert response.json["purchase_name"] is None
    assert response.json["category_impact"]["spent_before"] == 0
    assert response.json["category_impact"]["budget"] is None
    assert response.json["category_impact"]["would_exceed"] is None
    assert response.json["overall_impact"] is None


@pytest.mark.parametrize("payload", [
    None,
    ["not", "an", "object"],
    {"category": "Food"},
    {"amount": True, "category": "Food"},
    {"amount": 0, "category": "Food"},
    {"amount": -2, "category": "Food"},
    {"amount": 0.001, "category": "Food"},
    {"amount": float("inf"), "category": "Food"},
    {"amount": 100000001, "category": "Food"},
    {"amount": 10, "category": "Unknown"},
    {"amount": 10, "category": "Overall"},
    {"amount": 10, "category": "Food", "month": "2026-13"},
    {"amount": 10, "category": "Food", "month": "2026-02-30"},
    {"amount": 10, "category": "Food", "name": 42},
    {"amount": 10, "category": "Food", "name": "x" * 81},
])
def test_purchase_simulation_rejects_invalid_inputs(client, payload):
    assert signup(client).status_code == 201

    response = client.post("/api/budgets/simulate", json=payload)

    assert response.status_code == 400
    assert response.json["error"]


def test_purchase_simulation_is_isolated_between_users(client):
    assert signup(client).status_code == 201
    assert add_expense(client, 80, "Food").status_code == 201
    assert add_budget(client, "Food", 100).status_code == 201
    client.post("/api/auth/logout")
    assert signup(client, "second@example.com").status_code == 201

    response = client.post("/api/budgets/simulate", json=simulation_payload(amount=30))

    assert response.status_code == 200
    assert response.json["category_impact"] == {
        "budget": None,
        "spent_before": 0,
        "remaining_before": None,
        "remaining_after": None,
        "would_exceed": None,
    }
    assert response.json["overall_impact"] is None
    assert client.get("/api/expenses").json["expenses"] == []

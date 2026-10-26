from datetime import date, timedelta
import pytest


def expense_payload(**overrides):
    return {
        "amount": 12.5,
        "category": "Food",
        "date": "2026-10-24",
        "description": "Lunch",
        "payment_method": "Card",
        **overrides,
    }


def signup(client, email="sam@example.com"):
    return client.post("/api/auth/signup", json={
        "name": "Sam",
        "email": email,
        "password": "password123",
    })


def test_google_signin_without_credentials_returns_to_login(client):
    response = client.get("/api/auth/google")

    assert response.status_code == 302
    assert response.headers["Location"] == (
        "http://127.0.0.1:5500/login.html?oauth_error=google_unavailable"
    )


def test_auth_and_expense_crud(client):
    assert client.get("/api/expenses").status_code == 401
    assert client.post("/api/expenses", json=expense_payload()).status_code == 401
    assert client.delete("/api/expenses/1").status_code == 401
    assert signup(client).status_code == 201
    created = client.post("/api/expenses", json=expense_payload())
    assert created.status_code == 201
    assert created.json["expense"]["created_at"]
    assert created.json["expense"]["amount"] == 12.5
    assert isinstance(created.json["expense"]["amount"], (int, float))
    expense_id = created.json["expense"]["id"]
    assert len(client.get("/api/expenses?category=Food").json["expenses"]) == 1
    assert client.put(f"/api/expenses/{expense_id}", json={
        "amount": 18,
        "category": "Food",
        "date": "2026-10-24",
        "description": "Dinner",
        "payment_method": "Cash",
    }).json["expense"]["amount"] == 18
    assert client.delete(f"/api/expenses/{expense_id}").status_code == 200


def test_login_success_failure_and_logout(client):
    assert signup(client).status_code == 201
    assert client.post("/api/auth/logout").status_code == 200

    bad_password = client.post("/api/auth/login", json={
        "email": "sam@example.com",
        "password": "incorrect",
    })
    assert bad_password.status_code == 401
    assert client.get("/api/expenses").status_code == 401
    signed_in = client.post("/api/auth/login", json={
        "email": "SAM@example.com",
        "password": "password123",
    })
    assert signed_in.status_code == 200
    assert signed_in.json["user"]["email"] == "sam@example.com"
    assert client.get("/api/expenses").status_code == 200
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/expenses").status_code == 401


def test_auth_me_reports_google_signin_availability_without_exposing_credentials(client):
    client.application.config.update(
        GOOGLE_CLIENT_ID=None,
        GOOGLE_CLIENT_SECRET=None,
    )

    response = client.get("/api/auth/me")

    assert response.status_code == 200
    assert response.json == {
        "user": None,
        "google_sign_in_available": False,
    }


def test_income_and_budget_reject_boolean_amounts(client):
    assert signup(client).status_code == 201
    today = date.today().isoformat()
    month = today[:7]

    income = client.post("/api/income", json={
        "amount": True,
        "source": "Invalid amount",
        "date": today,
    })
    budget = client.post("/api/budgets", json={
        "amount": True,
        "category": "Overall",
        "month": month,
    })

    assert income.status_code == 400
    assert income.json["error"]
    assert budget.status_code == 400
    assert budget.json["error"]


@pytest.mark.parametrize("payload", [
    {"amount": 0, "source": "Salary", "date": "2026-10-26"},
    {"amount": -1, "source": "Salary", "date": "2026-10-26"},
    {"amount": 10, "source": "Salary", "date": "20261026"},
    {"amount": 10, "source": 42, "date": "2026-10-26"},
    {"amount": 10, "source": "x" * 61, "date": "2026-10-26"},
    {"amount": 10, "source": "Salary", "date": "2026-10-26", "description": []},
    {"amount": 10, "source": "Salary", "date": "2026-10-26", "description": "x" * 241},
])
def test_income_rejects_invalid_fields(client, payload):
    assert signup(client).status_code == 201

    response = client.post("/api/income", json=payload)

    assert response.status_code == 400
    assert response.json["error"]


@pytest.mark.parametrize("payload", [
    {"amount": 0, "category": "Overall", "month": "2026-10"},
    {"amount": -1, "category": "Overall", "month": "2026-10"},
    {"amount": 10, "category": "Unknown", "month": "2026-10"},
    {"amount": 10, "category": "Overall", "month": "2026-13"},
    {"amount": 10, "category": "Overall", "month": "2026-1"},
])
def test_budget_rejects_invalid_fields(client, payload):
    assert signup(client).status_code == 201

    response = client.post("/api/budgets", json=payload)

    assert response.status_code == 400
    assert response.json["error"]


def test_income_and_budget_are_isolated_between_users(client):
    assert signup(client, "income-owner@example.com").status_code == 201
    today = date.today().isoformat()
    month = today[:7]
    income = client.post("/api/income", json={
        "amount": 1200,
        "source": "Owner salary",
        "date": today,
    })
    budget = client.post("/api/budgets", json={
        "amount": 2500,
        "category": "Overall",
        "month": month,
    })
    assert income.status_code == 201
    assert budget.status_code == 201
    income_id = income.json["income"]["id"]
    budget_id = budget.json["budget"]["id"]

    assert client.post("/api/auth/logout").status_code == 200
    assert signup(client, "income-other@example.com").status_code == 201
    assert client.get("/api/income").json["income"] == []
    assert client.get(f"/api/budgets?month={month}").json["budgets"] == []
    other_budget = client.post("/api/budgets", json={
        "amount": 4000,
        "category": "Overall",
        "month": month,
    })
    assert other_budget.status_code == 201
    assert client.put(f"/api/income/{income_id}", json={
        "amount": 1,
        "source": "Hijacked",
        "date": today,
    }).status_code == 404
    assert client.delete(f"/api/income/{income_id}").status_code == 404
    assert client.delete(f"/api/budgets/{budget_id}").status_code == 404

    assert client.post("/api/auth/logout").status_code == 200
    assert client.post("/api/auth/login", json={
        "email": "income-owner@example.com",
        "password": "password123",
    }).status_code == 200
    assert len(client.get("/api/income").json["income"]) == 1
    owner_budgets = client.get(f"/api/budgets?month={month}").json["budgets"]
    assert len(owner_budgets) == 1
    assert owner_budgets[0]["amount"] == 2500


@pytest.mark.parametrize("payload", [
    ["not", "an", "object"],
    "not an object",
    42,
    None,
])
def test_signup_rejects_non_object_json_payloads(client, payload):
    response = client.post("/api/auth/signup", json=payload)

    assert response.status_code == 400
    assert response.json["error"] == "Request body must be a JSON object"


@pytest.mark.parametrize("payload", [
    {},
    expense_payload(amount=0),
    expense_payload(amount=0.001),
    expense_payload(amount=-1),
    expense_payload(amount="not-a-number"),
    expense_payload(category="Invalid"),
    expense_payload(date="2026-02-30"),
    expense_payload(date="20261024"),
    expense_payload(payment_method=""),
    expense_payload(payment_method="Bitcoin"),
    expense_payload(description={"unexpected": "object"}),
    {key: value for key, value in expense_payload().items() if key != "payment_method"},
])
def test_expense_rejects_invalid_or_missing_fields(client, payload):
    signup(client)

    response = client.post("/api/expenses", json=payload)

    assert response.status_code == 400


def test_expense_accepts_requested_bills_category_and_upi(client):
    signup(client)

    response = client.post("/api/expenses", json=expense_payload(
        category="Bills",
        payment_method="UPI",
    ))

    assert response.status_code == 201
    assert response.json["expense"]["category"] == "Bills"
    assert response.json["expense"]["payment_method"] == "UPI"


def test_expense_date_filters_and_invalid_ranges(client):
    signup(client)
    today = date.today()
    yesterday = today - timedelta(days=1)
    assert client.post("/api/expenses", json=expense_payload(
        date=today.isoformat(),
        category="Food",
    )).status_code == 201
    assert client.post("/api/expenses", json=expense_payload(
        date=yesterday.isoformat(),
        category="Transport",
    )).status_code == 201

    filtered = client.get(
        f"/api/expenses?start={today.isoformat()}&end={today.isoformat()}"
    )
    assert filtered.status_code == 200
    assert len(filtered.json["expenses"]) == 1
    assert filtered.json["expenses"][0]["category"] == "Food"

    assert client.get("/api/expenses?start=2026-02-30").status_code == 400
    assert client.get(
        f"/api/expenses?start={today.isoformat()}&end={yesterday.isoformat()}"
    ).status_code == 400


def test_budgets_and_dashboard(client):
    signup(client)
    today = date.today()
    income_response = client.post("/api/income", json={
        "amount": 1200,
        "source": "Part-time work",
        "date": today.isoformat(),
        "description": "October pay",
    })
    assert income_response.status_code == 201
    income_id = income_response.json["income"]["id"]
    updated_income = client.put(f"/api/income/{income_id}", json={
        "amount": 1300,
        "source": "Part-time work",
        "date": today.isoformat(),
        "description": "Updated pay",
    })
    assert updated_income.json["income"]["amount"] == 1300
    month = today.strftime("%Y-%m")
    response = client.post("/api/budgets", json={"category": "Overall", "month": month, "amount": 500})
    assert response.status_code == 201
    assert client.post("/api/budgets", json={"category": "Overall", "month": month, "amount": 650}).status_code == 201
    summary = client.get("/api/dashboard").json
    assert summary["monthly_budget"] == 650
    assert summary["monthly_income"] == 1300
    assert summary["monthly_expenses"] == 0
    assert summary["balance"] == 1300
    assert summary["remaining_budget"] == 650
    assert isinstance(summary["balance"], (int, float))
    assert client.delete(f"/api/income/{income_id}").status_code == 200


@pytest.mark.parametrize("payload", [
    ["not", "an", "object"],
    "not an object",
    42,
    None,
])
def test_income_rejects_non_object_json_payloads(client, payload):
    assert signup(client).status_code == 201

    response = client.post("/api/income", json=payload)

    assert response.status_code == 400
    assert response.json["error"] == "Request body must be a JSON object"


def test_income_update_rejects_non_object_json_payload(client):
    assert signup(client).status_code == 201
    created = client.post("/api/income", json={
        "amount": 250,
        "source": "Salary",
        "date": date.today().isoformat(),
        "description": "",
    })
    assert created.status_code == 201

    response = client.put(f"/api/income/{created.json['income']['id']}", json=["invalid"])

    assert response.status_code == 400
    assert response.json["error"] == "Request body must be a JSON object"


@pytest.mark.parametrize("payload", [
    ["not", "an", "object"],
    "not an object",
    42,
    None,
])
def test_budget_rejects_non_object_json_payloads(client, payload):
    assert signup(client).status_code == 201

    response = client.post("/api/budgets", json=payload)

    assert response.status_code == 400
    assert response.json["error"] == "Request body must be a JSON object"


def test_dashboard_and_budget_report_nonzero_monthly_spending(client):
    signup(client)
    today = date.today()
    month = today.strftime("%Y-%m")
    expense = client.post("/api/expenses", json=expense_payload(
        amount=100.25,
        category="Food",
        date=today.isoformat(),
    ))
    assert expense.status_code == 201
    income = client.post("/api/income", json={
        "amount": 500,
        "source": "Salary",
        "date": today.isoformat(),
        "description": "",
    })
    assert income.status_code == 201
    assert client.post("/api/budgets", json={
        "category": "Overall",
        "month": month,
        "amount": 200,
    }).status_code == 201
    assert client.post("/api/budgets", json={
        "category": "Food",
        "month": month,
        "amount": 150,
    }).status_code == 201

    summary = client.get("/api/dashboard").json
    assert summary["monthly_expenses"] == 100.25
    assert summary["monthly_income"] == 500
    assert summary["balance"] == 399.75
    assert summary["remaining_budget"] == 99.75
    assert summary["category_totals"] == [{"category": "Food", "amount": 100.25}]

    budgets = client.get(f"/api/budgets?month={month}").json["budgets"]
    spent = {budget["category"]: budget["spent"] for budget in budgets}
    assert spent == {"Food": 100.25, "Overall": 100.25}


def test_expense_validation(client):
    signup(client)
    response = client.post("/api/expenses", json={"amount": -1, "category": "Food", "date": "2026-10-24"})
    assert response.status_code == 400


def test_user_data_is_isolated(client):
    signup(client)
    created = client.post("/api/expenses", json=expense_payload(
        date=date.today().isoformat(),
        user_id=9999,
    ))
    assert created.status_code == 201
    expense_id = created.json["expense"]["id"]
    assert len(client.get("/api/expenses").json["expenses"]) == 1
    client.post("/api/auth/logout")
    assert signup(client, "alex@example.com").status_code == 201
    assert client.get("/api/expenses").json["expenses"] == []
    assert client.put(f"/api/expenses/{expense_id}", json=expense_payload(
        date=date.today().isoformat(),
    )).status_code == 404
    assert client.delete(f"/api/expenses/{expense_id}").status_code == 404
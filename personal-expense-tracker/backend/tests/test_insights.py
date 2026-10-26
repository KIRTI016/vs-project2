from datetime import date


def signup(client, email="insights@example.com"):
    return client.post("/api/auth/signup", json={
        "name": "Insights User",
        "email": email,
        "password": "password123",
    })


def add_expense(client, amount, category, expense_date):
    return client.post("/api/expenses", json={
        "amount": amount,
        "category": category,
        "date": expense_date.isoformat(),
        "description": "Test transaction",
        "payment_method": "Card",
    })


def test_insights_requires_authentication(client):
    response = client.get("/api/insights")

    assert response.status_code == 401
    assert response.json["error"] == "Authentication required"


def test_insights_empty_history_has_zero_total_and_no_comparison(client):
    assert signup(client).status_code == 201

    response = client.get("/api/insights")

    assert response.status_code == 200
    assert response.json["current_month"]["total"] == 0
    assert response.json["current_month"]["expense_count"] == 0
    assert response.json["previous_month"]["total"] is None
    assert response.json["previous_month"]["expense_count"] == 0
    assert response.json["comparison_available"] is False
    assert response.json["categories"] == []


def test_insights_calculate_category_totals_and_period_comparison(client):
    assert signup(client).status_code == 201
    initial = client.get("/api/insights").json
    current_start = date.fromisoformat(initial["current_month"]["start"])
    current_end = date.fromisoformat(initial["current_month"]["end"])
    previous_start = date.fromisoformat(initial["previous_month"]["start"])
    previous_end = date.fromisoformat(initial["previous_month"]["end"])

    assert add_expense(client, 100, "Food", previous_start).status_code == 201
    assert add_expense(client, 50, "Transport", previous_end).status_code == 201
    assert add_expense(client, 150, "Food", current_start).status_code == 201
    assert add_expense(client, 20.25, "Bills", current_end).status_code == 201

    response = client.get("/api/insights")

    assert response.status_code == 200
    assert response.json["current_month"]["total"] == 170.25
    assert response.json["current_month"]["expense_count"] == 2
    assert response.json["previous_month"]["total"] == 150
    assert response.json["previous_month"]["expense_count"] == 2
    assert response.json["comparison_available"] is True
    categories = {item["category"]: item for item in response.json["categories"]}
    assert categories["Food"] == {
        "category": "Food",
        "current_amount": 150,
        "previous_amount": 100,
        "change_amount": 50,
        "change_percent": 50,
    }
    assert categories["Transport"]["current_amount"] == 0
    assert categories["Transport"]["previous_amount"] == 50
    assert categories["Transport"]["change_amount"] == -50
    assert categories["Bills"]["current_amount"] == 20.25
    assert categories["Bills"]["previous_amount"] == 0
    assert categories["Bills"]["change_amount"] == 20.25
    assert categories["Bills"]["change_percent"] is None


def test_insights_leave_comparison_unavailable_without_previous_transactions(client):
    assert signup(client).status_code == 201
    initial = client.get("/api/insights").json
    current_date = date.fromisoformat(initial["current_month"]["end"])
    assert add_expense(client, 75.5, "Food", current_date).status_code == 201

    response = client.get("/api/insights")

    assert response.status_code == 200
    assert response.json["current_month"]["total"] == 75.5
    assert response.json["previous_month"]["total"] is None
    assert response.json["comparison_available"] is False
    assert response.json["categories"] == [{
        "category": "Food",
        "current_amount": 75.5,
        "previous_amount": None,
        "change_amount": None,
        "change_percent": None,
    }]


def test_insights_are_isolated_between_users(client):
    assert signup(client).status_code == 201
    initial = client.get("/api/insights").json
    current_date = date.fromisoformat(initial["current_month"]["end"])
    assert add_expense(client, 999, "Shopping", current_date).status_code == 201
    client.post("/api/auth/logout")
    assert signup(client, "second@example.com").status_code == 201

    response = client.get("/api/insights")

    assert response.status_code == 200
    assert response.json["current_month"]["total"] == 0
    assert response.json["current_month"]["expense_count"] == 0
    assert response.json["categories"] == []

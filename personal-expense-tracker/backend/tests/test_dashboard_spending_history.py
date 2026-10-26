from datetime import date

from app.extensions import db
from app.models import Expense, User


def signup(client, email="history@example.com"):
    return client.post("/api/auth/signup", json={
        "name": "History User",
        "email": email,
        "password": "password123",
    })


def login(client, email):
    return client.post("/api/auth/login", json={
        "email": email,
        "password": "password123",
    })


def month_start(months_ago=0):
    today = date.today()
    month_index = today.year * 12 + today.month - 1 - months_ago
    year, zero_based_month = divmod(month_index, 12)
    return date(year, zero_based_month + 1, 1)


def add_expense(user, amount, expense_date):
    db.session.add(Expense(
        user_id=user.id,
        amount=amount,
        category="Food",
        date=expense_date,
    ))
    db.session.commit()


def test_spending_history_requires_authentication(client):
    response = client.get("/api/dashboard/spending-history")

    assert response.status_code == 401


def test_spending_history_returns_current_month_and_six_previous_months(app, client):
    assert signup(client).status_code == 201
    user = User.query.filter_by(email="history@example.com").first()
    today = date.today()
    add_expense(user, 120.5, today)
    add_expense(user, 24.5, month_start(1))
    add_expense(user, 15, month_start(6))
    add_expense(user, 900, month_start(7))

    response = client.get("/api/dashboard/spending-history")

    assert response.status_code == 200
    assert response.json["current_month"] == {
        "month": today.strftime("%Y-%m"),
        "total": 120.5,
        "expense_count": 1,
    }
    assert len(response.json["months"]) == 7
    assert [month["month"] for month in response.json["months"]] == [
        month_start(6).strftime("%Y-%m"),
        month_start(5).strftime("%Y-%m"),
        month_start(4).strftime("%Y-%m"),
        month_start(3).strftime("%Y-%m"),
        month_start(2).strftime("%Y-%m"),
        month_start(1).strftime("%Y-%m"),
        today.strftime("%Y-%m"),
    ]
    assert response.json["months"][0]["total"] == 15
    assert response.json["months"][5]["total"] == 24.5
    assert response.json["months"][1]["total"] == 0
    assert all(month["month"] != month_start(7).strftime("%Y-%m") for month in response.json["months"])


def test_spending_history_returns_zero_filled_months_for_new_user(client):
    assert signup(client).status_code == 201

    response = client.get("/api/dashboard/spending-history")

    assert response.status_code == 200
    assert response.json["current_month"]["total"] == 0
    assert response.json["current_month"]["expense_count"] == 0
    assert len(response.json["months"]) == 7
    assert all(month["total"] == 0 and month["expense_count"] == 0 for month in response.json["months"])


def test_spending_history_only_includes_authenticated_users_expenses(app, client):
    assert signup(client, "first@example.com").status_code == 201
    first_user = User.query.filter_by(email="first@example.com").first()
    add_expense(first_user, 75, date.today())

    assert client.post("/api/auth/logout").status_code == 200
    assert signup(client, "second@example.com").status_code == 201
    second_user = User.query.filter_by(email="second@example.com").first()
    add_expense(second_user, 999, date.today())

    assert client.post("/api/auth/logout").status_code == 200
    assert login(client, "first@example.com").status_code == 200
    first_history = client.get("/api/dashboard/spending-history").json
    assert client.post("/api/auth/logout").status_code == 200
    assert login(client, "second@example.com").status_code == 200
    second_history = client.get("/api/dashboard/spending-history").json

    assert first_history["current_month"]["total"] == 75
    assert second_history["current_month"]["total"] == 999
    assert sum(month["total"] for month in first_history["months"]) == 75

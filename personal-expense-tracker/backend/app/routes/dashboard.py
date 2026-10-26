from datetime import date

from flask import Blueprint, jsonify
from flask_login import current_user, login_required
from sqlalchemy import func

from ..extensions import db
from ..models import Budget, Expense, Income

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.get("")
@login_required
def summary():
    today = date.today()
    month_start = today.replace(day=1)
    next_month = date(today.year + (today.month == 12), today.month % 12 + 1, 1)
    month_expenses = Expense.query.filter(
        Expense.user_id == current_user.id,
        Expense.date >= month_start,
        Expense.date < next_month,
    )
    monthly_total = db.session.scalar(db.select(func.coalesce(func.sum(Expense.amount), 0)).where(
        Expense.user_id == current_user.id,
        Expense.date >= month_start,
        Expense.date < next_month,
    )) or 0
    monthly_income = db.session.scalar(db.select(func.coalesce(func.sum(Income.amount), 0)).where(
        Income.user_id == current_user.id,
        Income.date >= month_start,
        Income.date < next_month,
    )) or 0
    overall_budget = Budget.query.filter_by(user_id=current_user.id, category="Overall", month=month_start).first()
    budgets = Budget.query.filter_by(user_id=current_user.id, month=month_start).all()
    grouped = db.session.query(Expense.category, func.sum(Expense.amount)).filter(
        Expense.user_id == current_user.id,
        Expense.date >= month_start,
        Expense.date < next_month,
    ).group_by(Expense.category).all()
    recent = month_expenses.order_by(Expense.date.desc(), Expense.id.desc()).limit(5).all()
    return jsonify({
        "month": month_start.isoformat(),
        "monthly_expenses": round(float(monthly_total), 2),
        "monthly_income": round(float(monthly_income), 2),
        "balance": round(float(monthly_income) - float(monthly_total), 2),
        "monthly_budget": overall_budget.amount if overall_budget else 0,
        "remaining_budget": round((overall_budget.amount if overall_budget else 0) - float(monthly_total), 2),
        "category_budgets": [budget.to_dict() for budget in budgets if budget.category != "Overall"],
        "category_totals": [{"category": category, "amount": round(float(amount), 2)} for category, amount in grouped],
        "recent_expenses": [expense.to_dict() for expense in recent],
    })


@dashboard_bp.get("/spending-history")
@login_required
def spending_history():
    today = date.today()
    current_month_start = today.replace(day=1)
    month_keys = []
    for months_ago in range(6, -1, -1):
        month_index = today.year * 12 + today.month - 1 - months_ago
        year, zero_based_month = divmod(month_index, 12)
        month_keys.append(f"{year:04d}-{zero_based_month + 1:02d}")

    first_month_index = today.year * 12 + today.month - 1 - 6
    first_year, first_zero_based_month = divmod(first_month_index, 12)
    history_start = date(first_year, first_zero_based_month + 1, 1)
    next_month = date(today.year + (today.month == 12), today.month % 12 + 1, 1)
    year_expression = func.extract("year", Expense.date)
    month_expression = func.extract("month", Expense.date)
    grouped_expenses = db.session.query(
        year_expression,
        month_expression,
        func.coalesce(func.sum(Expense.amount), 0),
        func.count(Expense.id),
    ).filter(
        Expense.user_id == current_user.id,
        Expense.date >= history_start,
        Expense.date < next_month,
    ).group_by(year_expression, month_expression).all()

    totals = {
        f"{int(year):04d}-{int(month):02d}": {
            "total": round(float(amount), 2),
            "expense_count": count,
        }
        for year, month, amount, count in grouped_expenses
    }
    months = [{
        "month": month_key,
        "total": totals.get(month_key, {}).get("total", 0),
        "expense_count": totals.get(month_key, {}).get("expense_count", 0),
    } for month_key in month_keys]
    current_month = next(item for item in months if item["month"] == current_month_start.strftime("%Y-%m"))

    return jsonify({
        "current_month": current_month,
        "months": months,
    })
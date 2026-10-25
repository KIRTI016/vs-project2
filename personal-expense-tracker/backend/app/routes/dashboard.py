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
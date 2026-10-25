from datetime import date
import math

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import Income

income_bp = Blueprint("income", __name__)


def parse_income(data):
    if not isinstance(data, dict):
        return None, "Request body must be a JSON object"
    try:
        amount = float(data.get("amount"))
        income_date = date.fromisoformat(str(data.get("date", "")))
    except (TypeError, ValueError):
        return None, "Enter a valid amount and date"
    source = str(data.get("source", "")).strip()
    description = str(data.get("description", "")).strip()
    if not math.isfinite(amount) or amount <= 0 or amount > 100000000:
        return None, "Amount must be greater than zero"
    if not source or len(source) > 60 or len(description) > 240:
        return None, "Enter a source under 60 characters and a description under 240 characters"
    return {
        "amount": round(amount, 2),
        "date": income_date,
        "source": source,
        "description": description,
    }, None


@income_bp.get("")
@login_required
def list_income():
    records = Income.query.filter_by(user_id=current_user.id).order_by(Income.date.desc(), Income.id.desc()).all()
    return jsonify({"income": [record.to_dict() for record in records]})


@income_bp.post("")
@login_required
def create_income():
    data, error = parse_income(request.get_json(silent=True))
    if error:
        return jsonify({"error": error}), 400
    record = Income(user_id=current_user.id, **data)
    db.session.add(record)
    db.session.commit()
    return jsonify({"income": record.to_dict()}), 201


@income_bp.put("/<int:income_id>")
@login_required
def update_income(income_id):
    record = Income.query.filter_by(id=income_id, user_id=current_user.id).first_or_404()
    data, error = parse_income(request.get_json(silent=True))
    if error:
        return jsonify({"error": error}), 400
    for key, value in data.items():
        setattr(record, key, value)
    db.session.commit()
    return jsonify({"income": record.to_dict()})


@income_bp.delete("/<int:income_id>")
@login_required
def delete_income(income_id):
    record = Income.query.filter_by(id=income_id, user_id=current_user.id).first_or_404()
    db.session.delete(record)
    db.session.commit()
    return jsonify({"message": "Income deleted"})
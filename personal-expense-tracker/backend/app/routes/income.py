from datetime import date
import math
import re

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import Income

income_bp = Blueprint("income", __name__)


def parse_income(data):
    if not isinstance(data, dict):
        return None, "Request body must be a JSON object"
    amount_value = data.get("amount")
    if isinstance(amount_value, bool):
        return None, "Enter a valid amount and date"
    try:
        amount = float(amount_value)
        date_value = data.get("date")
        if not isinstance(date_value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", date_value):
            raise ValueError
        income_date = date.fromisoformat(date_value)
    except (TypeError, ValueError):
        return None, "Enter a valid amount and date"
    source_value = data.get("source")
    description_value = data.get("description", "")
    if not isinstance(source_value, str) or not isinstance(description_value, str):
        return None, "Source and description must be text"
    source = source_value.strip()
    description = description_value.strip()
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
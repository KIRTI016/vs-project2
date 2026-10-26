import secrets

from authlib.integrations.base_client.errors import OAuthError
from flask import Blueprint, jsonify, request
from flask import current_app, redirect, url_for
from flask_login import current_user, login_user, logout_user, login_required
from sqlalchemy import func

from ..extensions import db, oauth
from ..models import User

auth_bp = Blueprint("auth", __name__)


def _login_redirect(error=None):
    url = f"{current_app.config['FRONTEND_ORIGIN'].rstrip('/')}/login.html"
    if error:
        return redirect(f"{url}?oauth_error={error}")
    return redirect(url)


@auth_bp.get("/google")
def google_login():
    if not current_app.config["GOOGLE_CLIENT_ID"] or not current_app.config["GOOGLE_CLIENT_SECRET"]:
        return _login_redirect("google_unavailable")
    callback_url = url_for("auth.google_callback", _external=True)
    return oauth.google.authorize_redirect(callback_url)


@auth_bp.get("/google/callback")
def google_callback():
    if not current_app.config["GOOGLE_CLIENT_ID"] or not current_app.config["GOOGLE_CLIENT_SECRET"]:
        return _login_redirect("google_unavailable")

    try:
        token = oauth.google.authorize_access_token()
    except OAuthError as error:
        current_app.logger.warning("Google sign-in failed: %s", error.error)
        return _login_redirect("google_failed")

    profile = token.get("userinfo")
    email = profile.get("email") if profile else None
    if not profile or profile.get("email_verified") is not True or not isinstance(email, str):
        current_app.logger.warning("Google sign-in did not return a verified email address")
        return _login_redirect("google_email_unverified")

    email = email.strip().lower()
    if not email or len(email) > 120:
        current_app.logger.warning("Google sign-in returned an invalid email address")
        return _login_redirect("google_email_unverified")

    user = db.session.scalar(db.select(User).where(func.lower(User.email) == email))
    if not user:
        name = profile.get("name")
        if not isinstance(name, str) or not name.strip():
            name = email.split("@", 1)[0]
        user = User(name=name.strip()[:80], email=email)
        user.set_password(secrets.token_urlsafe(32))
        db.session.add(user)
        db.session.commit()

    login_user(user)
    return _login_redirect()


@auth_bp.post("/signup")
def signup():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")
    if not name or len(name) > 80 or "@" not in email or len(email) > 120:
        return jsonify({"error": "Enter a valid name and email address"}), 400
    if not isinstance(password, str) or len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    if db.session.scalar(db.select(User).where(func.lower(User.email) == email)):
        return jsonify({"error": "An account with this email already exists"}), 409

    user = User(name=name, email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    login_user(user)
    return jsonify({"user": user.to_dict()}), 201


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")
    user = db.session.scalar(db.select(User).where(func.lower(User.email) == email))
    if not user or not isinstance(password, str) or not user.check_password(password):
        return jsonify({"error": "Email or password is incorrect"}), 401
    login_user(user)
    return jsonify({"user": user.to_dict()})


@auth_bp.post("/logout")
@login_required
def logout():
    logout_user()
    return jsonify({"message": "Signed out"})


@auth_bp.get("/me")
def me():
    if not current_user.is_authenticated:
        return jsonify({
            "user": None,
            "google_sign_in_available": bool(
                current_app.config["GOOGLE_CLIENT_ID"]
                and current_app.config["GOOGLE_CLIENT_SECRET"]
            ),
        }), 200
    return jsonify({
        "user": current_user.to_dict(),
        "google_sign_in_available": bool(
            current_app.config["GOOGLE_CLIENT_ID"]
            and current_app.config["GOOGLE_CLIENT_SECRET"]
        ),
    })
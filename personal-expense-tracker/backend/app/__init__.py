from flask import Flask, jsonify
from flask_cors import CORS

from config import Config
from .extensions import db, login_manager, oauth


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)

    oauth.init_app(app)
    if app.config["GOOGLE_CLIENT_ID"] and app.config["GOOGLE_CLIENT_SECRET"]:
        oauth.register(
            name="google",
            client_id=app.config["GOOGLE_CLIENT_ID"],
            client_secret=app.config["GOOGLE_CLIENT_SECRET"],
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )

    CORS(
        app,
        origins=[app.config["FRONTEND_ORIGIN"]],
        supports_credentials=True,
        allow_headers=["Content-Type"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    )
    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = None

    from . import models
    from .routes.auth import auth_bp
    from .routes.budgets import budgets_bp
    from .routes.dashboard import dashboard_bp
    from .routes.expenses import expenses_bp
    from .routes.income import income_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(expenses_bp, url_prefix="/api/expenses")
    app.register_blueprint(income_bp, url_prefix="/api/income")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(budgets_bp, url_prefix="/api/budgets")

    @login_manager.unauthorized_handler
    def unauthorized():
        return jsonify({"error": "Authentication required"}), 401

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    with app.app_context():
        db.create_all()

    return app
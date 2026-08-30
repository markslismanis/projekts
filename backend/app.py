from flask import Flask, request, jsonify, redirect, url_for, session
from flask_cors import CORS
from datetime import datetime
from datetime import timedelta
import sqlite3
import os
from dotenv import load_dotenv
from authlib.integrations.flask_client import OAuth
from functools import wraps

basedir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(basedir, "keys.env"))

app = Flask(__name__)
app.secret_key = os.environ["FLASK_SECRET_KEY"]
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=1)
CORS(app)

oauth = OAuth(app)
google = oauth.register(
    name='google',
    client_id=os.environ["GOOGLE_CLIENT_ID"],
    client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'}
)

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_email' not in session:
            return jsonify({"error": "Not logged in"}), 401
        return f(*args, **kwargs)
    return decorated

DB_PATH = os.path.join(os.path.dirname(__file__), "dati.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            split TEXT NOT NULL,
            exercise TEXT NOT NULL ,
            reps INTEGER  ,
            weight INTEGER  ,
            saved_at TEXT NOT NULL 
            )
    """)
    conn.close()

init_db()

@app.route("/login")
def login():
    redirect_uri = "http://marks.rucis.lv/auth/callback"
    return google.authorize_redirect(redirect_uri)

@app.route("/auth/callback")
def auth_callback():
    token = google.authorize_access_token()
    user_info = token.get('userinfo')
    session.permanent = True
    session['user_email'] = user_info['email']
    return redirect("/")

@app.route("/logout")
def logout():
    session.pop('user_email', None)
    return redirect("/")

@app.route("/save/<split>/<exercise>", methods=["POST"])
@login_required
def save_workout(split, exercise):
    data = request.get_json()
    sets = data.get("sets", [])
    saved_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect(DB_PATH)
    for s in sets:
        reps = s.get("reps")
        weight = s.get("weight")
        conn.execute(
            "INSERT INTO workouts (split, exercise, reps, weight, saved_at) VALUES (?, ?, ?, ?, ?)",
        (   split, exercise, reps, weight, saved_at)
        )
    conn.execute("""
        DELETE FROM workouts
        WHERE split = ? AND exercise = ?
        AND saved_at NOT IN (
            SELECT DISTINCT saved_at FROM workouts
            WHERE split = ? AND exercise = ?
            ORDER BY saved_at DESC
            LIMIT 10
        )
""", (split, exercise, split, exercise))
    conn.commit()
    conn.close()
    return jsonify({"message": "Workout saved!"})

@app.route("/workouts/<split>", methods=["GET"])
@login_required
def get_split_workouts(split):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM workouts WHERE split = ? ", (split, )).fetchall()
    conn.close()

    workouts = []
    for row in rows:
        workouts.append(dict(row))
    return jsonify(workouts)

@app.route("/workouts/<split>/<exercise>", methods=["GET"])
@login_required
def get_exercise_workouts(split, exercise):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM workouts WHERE split = ? AND exercise = ?", (split, exercise)).fetchall()
    conn.close()

    sessions = {}
    for row in rows:
        ts = row["saved_at"]
        if ts not in sessions:
            sessions[ts] = []
        sessions[ts].append({"reps": row["reps"], "weight": row["weight"]})

    timestamps = sorted(sessions.keys(), reverse=True)
    current = sessions[timestamps[0]] if timestamps else []
    last = sessions[timestamps[1]] if len(timestamps) > 1 else None

    return jsonify({"sets": current, "last":last})

@app.route("/workouts/<split>/<exercise>", methods=["DELETE"])
@login_required
def delete_exercise_workouts(split, exercise):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("DELETE FROM workouts WHERE split = ? AND exercise = ?", (split, exercise))
    conn.commit()
    conn.close()
    return jsonify({"message": "Workouts deleted!"})
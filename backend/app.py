from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime
import sqlite3
import os

app = Flask(__name__)
CORS(app)

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

@app.route("/save/<split>/<exercise>", methods=["POST"])
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
def delete_exercise_workouts(split, exercise):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("DELETE FROM workouts WHERE split = ? AND exercise = ?", (split, exercise))
    conn.commit()
    conn.close()
    return jsonify({"message": "Workouts deleted!"})

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)
    
"""Attach the screenshot states to the account the app itself created.

The app signs in as a guest through its own UI; this takes that newest user, gives it
a name, promotes it to a full account (the same row a Google sign-in produces) and
seeds its tables. The access token is minted with the backend's own helper, so no
private flow is re-implemented here.

  uv run python seed_app_user.py <me> <friend>     # from backend/
"""
import json
import subprocess
import sys
import urllib.error
import urllib.request
import uuid

sys.path.insert(0, ".")
from app.core.security import create_access_token  # noqa: E402

API = "http://127.0.0.1:8001"


def psql(statement):
    out = subprocess.run(["docker", "exec", "buraco-db", "psql", "-U", "buraco", "-d", "buraco",
                          "-tAc", statement], check=True, capture_output=True, text=True)
    return out.stdout.strip()


def call(method, path, token, body=None):
    req = urllib.request.Request(API + path, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code}: {e.read().decode()[:300]}")


def play(token, table, turns, stop_in_draw=True):
    for _ in range(turns):
        v = call("GET", f"/tables/{table}", token)
        g = v.get("game") or {}
        if v.get("status") == "round_over" or g.get("phase") == "over":
            call("POST", f"/tables/{table}/next-round", token, {})
            continue
        if g.get("current") != v.get("my_seat"):
            break
        if stop_in_draw and g.get("phase") == "draw" and len(g.get("discard", [])) >= 2 \
                and v.get("scores") and max(v["scores"]) > 0:
            return v
        hint = call("GET", f"/tables/{table}/hint", token)["action"]
        call("POST", f"/tables/{table}/actions", token, {"action": hint})
    return call("GET", f"/tables/{table}", token)


def main():
    me_name = sys.argv[1] if len(sys.argv) > 1 else "Emma"
    friend_name = sys.argv[2] if len(sys.argv) > 2 else "Sam"

    user_id = psql("SELECT id FROM users ORDER BY created_at DESC LIMIT 1;")
    if not user_id:
        raise SystemExit("no users yet — sign in as a guest in the app first")
    token = create_access_token(uuid.UUID(user_id))
    psql(f"UPDATE users SET is_guest = false, display_name = '{me_name}' WHERE id = '{user_id}';")
    print(f"app user {user_id} -> {me_name}")

    # The friend who joins the lobby table.
    ftok = urllib.request.urlopen(urllib.request.Request(API + "/auth/guest", method="POST"))
    friend = json.loads(ftok.read())
    fid = friend["user"]["id"] if "user" in friend else None
    ftoken = friend["access_token"]
    if fid is None:
        fid = psql("SELECT id FROM users ORDER BY created_at DESC LIMIT 1;")
    psql(f"UPDATE users SET is_guest = false, display_name = '{friend_name}' WHERE id = '{fid}';")

    main_t = call("POST", "/tables", token, {"num_players": 4, "seats": ["bot", "bot", "bot"],
                                             "mode": "live", "preset": "aberto",
                                             "bot_level": "standard", "target_score": 3000})
    v = play(token, main_t["id"], 120)
    print(f"table 01/06  {main_t['id']}  scores {v.get('scores')}  pts {v.get('round_points')}")

    practice = call("POST", "/tables", token, {"num_players": 2, "seats": ["bot"], "mode": "async",
                                               "preset": "aberto", "bot_level": "relaxed",
                                               "target_score": 1500})
    v = play(token, practice["id"], 40)
    print(f"table 05     {practice['id']}  phase {(v.get('game') or {}).get('phase')}")

    lobby = call("POST", "/tables", token, {"num_players": 4, "seats": ["bot", "friend", "bot"],
                                            "mode": "live", "preset": "aberto",
                                            "bot_level": "standard"})
    call("POST", "/tables/join", ftoken, {"code": lobby["code"]})
    print(f"table 03     {lobby['id']}  code {lobby['code']}  friend {friend_name}")


if __name__ == "__main__":
    main()

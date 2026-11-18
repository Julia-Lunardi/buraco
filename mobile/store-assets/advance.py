"""Advance a seeded table to a good screenshot state: at least one finished round
(so the score chips carry real match scores), then a second round played far enough
for melds to be on the felt, stopping on my turn with cards in the discard pile.

  python3 advance.py <token> <table_id> [max_turns]
"""
import json
import sys
import urllib.error
import urllib.request

API = "http://127.0.0.1:8001"


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
        return {"_error": e.code, "_body": e.read().decode()[:200]}


def state(v):
    g = v.get("game") or {}
    return (v.get("status"), g.get("phase"), g.get("current"), v.get("my_seat"),
            len(g.get("discard", [])), v.get("scores"), v.get("round_points"))


def main():
    token, table = sys.argv[1], sys.argv[2]
    max_turns = int(sys.argv[3]) if len(sys.argv) > 3 else 120
    rounds_done = 0
    for _ in range(max_turns):
        v = call("GET", f"/tables/{table}", token)
        status, phase, current, seat, pile, scores, pts = state(v)
        if status == "finished":
            print("match over — too far"); break
        if phase == "over" or status == "round_over":
            r = call("POST", f"/tables/{table}/next-round", token, {})
            rounds_done += 1
            print(f"round {rounds_done} done, scores {scores}")
            if "_error" in r:
                print("next-round:", r); break
            continue
        if current != seat:
            print("waiting on a bot — unexpected"); break
        # Stop once a round is banked, melds are down and the pile has cards to take.
        if (rounds_done >= 1 and phase == "draw" and pile >= 2
                and pts and max(pts) >= 150):
            print(f"STOP  scores {scores}  round points {pts}  pile {pile}")
            return
        hint = call("GET", f"/tables/{table}/hint", token)
        if "_error" in hint:
            print("hint:", hint); break
        r = call("POST", f"/tables/{table}/actions", token, {"action": hint["action"]})
        if "_error" in r:
            print("action:", r); break
    v = call("GET", f"/tables/{table}", token)
    print("final", state(v))


if __name__ == "__main__":
    main()

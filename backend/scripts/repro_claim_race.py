import concurrent.futures
import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"


def request(method, path, user, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-Persona-User": user,
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode()
            return resp.status, json.loads(body) if body else None
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        try:
            parsed = json.loads(body) if body else {"raw": body}
        except json.JSONDecodeError:
            parsed = {"raw": body}
        return exc.code, parsed


def claim(user, item_id):
    status, body = request("POST", f"/api/work-items/{item_id}/claim/", user, {})
    return user, status, body


def run_once(i):
    status, item = request(
        "POST",
        "/api/work-items/",
        "david_kim",
        {
            "title": f"Concurrent Claim Debug {i}",
            "description": "debug race",
            "category": "ENGINEERING_INCIDENT",
            "priority": "P1_HIGH",
        },
    )
    if status != 201:
        return {"round": i, "create": status, "body": item}

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(claim, "david_kim", item["id"]),
            pool.submit(claim, "marcus_vance", item["id"]),
        ]
        results = [fut.result() for fut in concurrent.futures.as_completed(futures)]

    codes = sorted(code for _, code, _ in results)
    return {
        "round": i,
        "item": item["tracking_number"],
        "codes": codes,
        "details": [
            {
                "user": user,
                "code": code,
                "message": (body.get("message") if isinstance(body, dict) else str(body)[:120]),
            }
            for user, code, body in results
        ],
    }


def main():
    summary = [run_once(i) for i in range(8)]
    for row in summary:
        print(row)
    bad = [row for row in summary if row.get("codes") != [200, 409]]
    print("BAD_ROUNDS", len(bad))


if __name__ == "__main__":
    main()

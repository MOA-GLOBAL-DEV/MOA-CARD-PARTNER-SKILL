#!/usr/bin/env python3
"""MOA 카드 파트너 API 요청 서명 도구 (Python 3.9 이상, 표준 라이브러리만 사용)

서명 원문(5줄, LF로 잇고 마지막 줄 뒤에는 줄바꿈 없음)
  timestamp \\n METHOD \\n path_with_query \\n idempotency_key(없으면 빈 줄) \\n hex(sha256(본문 바이트))
X-Moa-Signature = "v1=" + hex(HMAC-SHA256(key = 비밀키 문자열의 UTF-8 바이트, message = 원문))

사용법
  export MOA_PARTNER_KEY_ID=pk_test_...   # 키 ID
  export MOA_PARTNER_SECRET=sk_test_...   # 비밀키. 이 스크립트는 비밀키를 출력하지 않는다
  python3 sign_request.py --method GET --path /partner/v1/ping
  python3 sign_request.py --method POST --path /partner/v1/members \\
      --body '{"email":"user@example.com","partner_member_id":"u-1029"}'
  python3 sign_request.py ... --curl       # 그대로 실행할 수 있는 curl 명령 출력(서명은 한 번만 쓸 수 있다)
  python3 sign_request.py --self-test      # 문서의 검증용 고정값으로 서명 함수 확인(환경변수 불필요)

모듈로 쓰기
  from sign_request import sign_request, build_signed_headers
"""
import argparse
import hashlib
import hmac
import json
import os
import re
import shlex
import sys
import time
import uuid

DEFAULT_BASE_URL = "https://api.moacard.io"
EMPTY_BODY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


def _to_bytes(body):
    if body is None:
        return b""
    if isinstance(body, str):
        return body.encode("utf-8")
    return bytes(body)


def sha256_hex(body):
    return hashlib.sha256(_to_bytes(body)).hexdigest()


def canonical_string(timestamp, method, path_with_query, idempotency_key, raw_body):
    """서명 원문 5줄"""
    return "\n".join([
        str(timestamp),
        method.upper(),
        path_with_query,
        idempotency_key or "",
        sha256_hex(raw_body),
    ])


def sign_request(secret, timestamp, method, path_with_query, idempotency_key, raw_body):
    """X-Moa-Signature 값(v1=<소문자 hex 64자>). raw_body는 실제로 보낼 bytes(또는 str)"""
    canonical = canonical_string(timestamp, method, path_with_query, idempotency_key, raw_body)
    mac = hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256)
    return "v1=" + mac.hexdigest()


def to_path_with_query(path_or_url):
    """'https://api.moacard.io/partner/v1/x?y' -> '/partner/v1/x?y' (쿼리 문자열은 손대지 않는다)"""
    return re.sub(r"^https?://[^/]+", "", str(path_or_url), flags=re.IGNORECASE)


def build_signed_headers(key_id, secret, method, path_with_query, body=b"", idempotency_key=None, timestamp=None):
    """서명 헤더를 만든다. POST인데 idempotency_key가 없으면 새 UUID(재시도는 처음 키를 다시 넘긴다)"""
    if not key_id or not secret:
        raise ValueError("key_id와 secret이 필요합니다")
    m = method.upper()
    path = to_path_with_query(path_with_query)
    ts = str(timestamp if timestamp is not None else int(time.time()))
    key = idempotency_key or (str(uuid.uuid4()) if m == "POST" else "")
    raw = _to_bytes(body)
    headers = {
        "X-Moa-Key-Id": key_id,
        "X-Moa-Timestamp": ts,
        "X-Moa-Signature": sign_request(secret, ts, m, path, key, raw),
    }
    if key:
        headers["Idempotency-Key"] = key
    if raw:
        headers["Content-Type"] = "application/json"
    return {"headers": headers, "canonical": canonical_string(ts, m, path, key, raw), "idempotency_key": key or None}


# ─── 검증용 고정값(문서 전용 가짜 비밀키) ────────────────────────────────────

TEST_VECTORS = [
    {
        "name": "POST /partner/v1/members",
        "secret": "sk_test_TestSecretForDocumentationOnly0000000000000",
        "timestamp": "1793928225",
        "method": "POST",
        "path_with_query": "/partner/v1/members",
        "idempotency_key": "7f3c2a10-5b8e-4c1d-9a6f-2e4b8d0c1a35",
        "body": '{"email":"user@example.com","partner_member_id":"u-1029"}',
        "body_sha256": "0c14b4384d77f3e98410d6043f1af826ad251bb6be678fa9fad42d8ff50fc798",
        "signature": "v1=25a4a6baf576fb3ded36b501a6139b36941a191eabc6895fa244d58230042823",
    },
    {
        "name": "GET /partner/v1/members?partner_member_id=u-1029",
        "secret": "sk_test_TestSecretForDocumentationOnly0000000000000",
        "timestamp": "1793928225",
        "method": "GET",
        "path_with_query": "/partner/v1/members?partner_member_id=u-1029",
        "idempotency_key": "",
        "body": "",
        "body_sha256": EMPTY_BODY_SHA256,
        "signature": "v1=3fd357c7aed5d76a43613ef7df241e32ac65736e0d19743faea604ac8e3dc9b8",
    },
]


def self_test():
    ok = True
    for v in TEST_VECTORS:
        body_sha = sha256_hex(v["body"])
        sig = sign_request(v["secret"], v["timestamp"], v["method"], v["path_with_query"], v["idempotency_key"], v["body"])
        passed = body_sha == v["body_sha256"] and sig == v["signature"]
        ok = ok and passed
        print("%s  %s" % ("PASS" if passed else "FAIL", v["name"]))
        print("      body_sha256 %s" % body_sha)
        print("      signature   %s%s" % (sig, "" if passed else "  (기대값 %s)" % v["signature"]))
    return ok


def main(argv=None):
    p = argparse.ArgumentParser(description="MOA 카드 파트너 API 요청 서명(비밀키는 출력하지 않음)")
    p.add_argument("--method", default="GET")
    p.add_argument("--path", help="/partner/v1부터 쓴 경로와 쿼리. 예: /partner/v1/members?limit=10")
    g = p.add_mutually_exclusive_group()
    g.add_argument("--body", help="보낼 본문 문자열(이 바이트 그대로 서명)")
    g.add_argument("--body-file", help="보낼 본문 파일(이 바이트 그대로 서명)")
    p.add_argument("--idempotency-key", help="POST 재시도 때 처음 키를 다시 넣는다. 없으면 새 UUID")
    p.add_argument("--timestamp", help="테스트용. 생략하면 현재 Unix 초")
    p.add_argument("--base-url", help="기본 https://api.moacard.io (또는 MOA_PARTNER_BASE_URL)")
    p.add_argument("--curl", action="store_true", help="curl 명령 출력")
    p.add_argument("--self-test", action="store_true", help="검증용 고정값 확인")
    a = p.parse_args(argv)

    if a.self_test:
        return 0 if self_test() else 1

    key_id = os.environ.get("MOA_PARTNER_KEY_ID", "")
    secret = os.environ.get("MOA_PARTNER_SECRET", "")
    if not key_id or not secret:
        print("환경변수 MOA_PARTNER_KEY_ID, MOA_PARTNER_SECRET을 설정하세요(값은 출력하지 않습니다).", file=sys.stderr)
        return 2
    if not a.path:
        print("--path가 필요합니다. 예: --path /partner/v1/ping", file=sys.stderr)
        return 2
    key_env = re.match(r"^pk_(test|live)_", key_id)
    secret_env = re.match(r"^sk_(test|live)_", secret)
    if not key_env:
        print("경고: 키 ID가 pk_test_ 또는 pk_live_로 시작하지 않습니다.", file=sys.stderr)
    if not secret_env:
        print("경고: 비밀키가 sk_test_ 또는 sk_live_로 시작하지 않습니다(값은 출력하지 않습니다).", file=sys.stderr)
    if key_env and secret_env and key_env.group(1) != secret_env.group(1):
        print("경고: 키 ID(%s)와 비밀키(%s)의 환경이 다릅니다." % (key_env.group(1), secret_env.group(1)), file=sys.stderr)

    path = to_path_with_query(a.path)
    if not path.startswith("/partner/v1/"):
        print("경고: 서명 경로는 /partner/v1부터 써야 합니다(예: /partner/v1/members).", file=sys.stderr)
    if a.body_file is not None:
        with open(a.body_file, "rb") as f:
            body = f.read()
    else:
        body = (a.body or "").encode("utf-8")
    method = a.method.upper()
    if method == "GET" and body:
        print("경고: GET 요청에는 본문을 보내지 않습니다.", file=sys.stderr)

    signed = build_signed_headers(key_id, secret, method, path, body, a.idempotency_key, a.timestamp)
    base_url = (a.base_url or os.environ.get("MOA_PARTNER_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
    url = base_url + path

    if a.curl:
        parts = ["curl", "-sS", "-i", "-X", method, shlex.quote(url)]
        for k, v in signed["headers"].items():
            parts += ["-H", shlex.quote("%s: %s" % (k, v))]
        if body:
            if a.body_file is not None:
                parts += ["--data-binary", shlex.quote("@" + a.body_file)]
            else:
                parts += ["--data-raw", shlex.quote(a.body)]
        print(" ".join(parts))
        print("참고: 이 서명은 한 번만 쓸 수 있고 ±300초 안에서만 유효합니다. 다시 보낼 때는 새로 만드세요.", file=sys.stderr)
        return 0

    print(json.dumps({
        "method": method,
        "url": url,
        "headers": signed["headers"],
        "idempotency_key": signed["idempotency_key"],
        "body_sha256": sha256_hex(body),
        "canonical": signed["canonical"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

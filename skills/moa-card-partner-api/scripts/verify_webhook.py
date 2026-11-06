#!/usr/bin/env python3
"""MOA 카드 파트너 API 웹훅 서명 검증 (Python 3.9 이상, 표준 라이브러리만 사용)

X-Moa-Signature: t=<Unix 초>,v1=<hex>
v1 = hex(HMAC-SHA256(key = 웹훅 서명 키(whsec_…) 문자열의 UTF-8 바이트, message = t + "." + 받은 본문 원문 바이트))
- 본문은 받은 그대로의 bytes로 검증한다(JSON 파싱 후 다시 직렬화하면 맞지 않는다)
- t가 현재 시각과 300초 넘게 차이 나면 버린다. 비교는 상수 시간(hmac.compare_digest)

사용법
  export MOA_WEBHOOK_SECRET=whsec_...     # 이 스크립트는 키를 출력하지 않는다
  python3 verify_webhook.py --header 't=1793928225,v1=…' --body-file body.json [--now 1793928225]
  python3 verify_webhook.py --self-test   # 문서의 검증용 고정값 확인(환경변수 불필요)

모듈로 쓰기(Flask 예)
  from verify_webhook import verify_moa_webhook
  verify_moa_webhook(SECRET, request.headers.get("X-Moa-Signature"), request.get_data())
"""
import argparse
import hashlib
import hmac
import os
import re
import sys
import time

DEFAULT_TOLERANCE_SEC = 300


def parse_signature_header(header):
    """'t=…,v1=…' -> (t, v1). 없으면 빈 문자열"""
    parts = {}
    for item in (header or "").split(","):
        key, sep, value = item.partition("=")
        if sep:
            parts[key.strip()] = value.strip()
    return parts.get("t", ""), parts.get("v1", "")


def check_moa_webhook(secret, signature_header, raw_body, tolerance_sec=DEFAULT_TOLERANCE_SEC, now=None):
    """(ok, reason). reason: malformed_header | timestamp_out_of_range | signature_mismatch | None"""
    t, v1 = parse_signature_header(signature_header)
    if not t.isdigit() or not re.fullmatch(r"[0-9a-fA-F]{64}", v1):
        return False, "malformed_header"
    now = int(time.time()) if now is None else int(now)
    if abs(now - int(t)) > tolerance_sec:
        return False, "timestamp_out_of_range"
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), t.encode("ascii") + b"." + (raw_body or b""), hashlib.sha256).hexdigest()
    if hmac.compare_digest(expected, v1.lower()):
        return True, None
    return False, "signature_mismatch"


def verify_moa_webhook(secret, signature_header, raw_body, tolerance_sec=DEFAULT_TOLERANCE_SEC, now=None):
    """True / False"""
    return check_moa_webhook(secret, signature_header, raw_body, tolerance_sec, now)[0]


# ─── 검증용 고정값(문서 전용 가짜 키) ──────────────────────────────────────

TEST_VECTOR = {
    "secret": "whsec_TestWebhookSecretForDocumentationOnly000000",
    "body": '{"event_id":"evt_01jbz7h3k5n7q9s1v3x5z7b9d1","type":"ping","environment":"test",'
            '"created_at":"2026-11-06T01:23:45.000Z","data":{"partner_id":"ptn_01jbz0a1b2c3d4e5f6g7h8j9k0"}}',
    "header": "t=1793928225,v1=049e6da144aa7c27f1f770f389cba4c8989bd05d5c812329b421f8fecde69694",
    "now": 1793928225,
}


def self_test():
    v = TEST_VECTOR
    body = v["body"].encode("utf-8")
    cases = [
        ("고정값 그대로 → valid", check_moa_webhook(v["secret"], v["header"], body, now=v["now"]), True),
        ("본문 한 글자 변경 → invalid", check_moa_webhook(v["secret"], v["header"], body.replace(b"ping", b"pong"), now=v["now"]), False),
        ("다른 키 → invalid", check_moa_webhook("whsec_Other", v["header"], body, now=v["now"]), False),
        ("t가 301초 지남 → invalid", check_moa_webhook(v["secret"], v["header"], body, now=v["now"] + 301), False),
        ("t가 300초 지남 → valid", check_moa_webhook(v["secret"], v["header"], body, now=v["now"] + 300), True),
        ("헤더 형식 오류 → invalid", check_moa_webhook(v["secret"], "v1=abc", body, now=v["now"]), False),
    ]
    ok = True
    for name, (result, reason), expected in cases:
        passed = result == expected
        ok = ok and passed
        print("%s  %s%s" % ("PASS" if passed else "FAIL", name, " (%s)" % reason if reason else ""))
    return ok


def main(argv=None):
    p = argparse.ArgumentParser(description="MOA 웹훅 X-Moa-Signature 검증(키는 출력하지 않음)")
    p.add_argument("--header", help="받은 X-Moa-Signature 값")
    g = p.add_mutually_exclusive_group()
    g.add_argument("--body", help="받은 본문 문자열")
    g.add_argument("--body-file", help="받은 본문 원문 파일")
    p.add_argument("--now", type=int, help="테스트용 현재 시각(Unix 초)")
    p.add_argument("--tolerance", type=int, default=DEFAULT_TOLERANCE_SEC)
    p.add_argument("--self-test", action="store_true")
    a = p.parse_args(argv)

    if a.self_test:
        return 0 if self_test() else 1
    secret = os.environ.get("MOA_WEBHOOK_SECRET", "")
    if not secret:
        print("환경변수 MOA_WEBHOOK_SECRET을 설정하세요(값은 출력하지 않습니다).", file=sys.stderr)
        return 2
    if not a.header or (a.body is None and a.body_file is None):
        print("--header 't=…,v1=…'와 --body-file(또는 --body)이 필요합니다.", file=sys.stderr)
        return 2
    if a.body_file is not None:
        with open(a.body_file, "rb") as f:
            raw = f.read()
    else:
        raw = a.body.encode("utf-8")
    ok, reason = check_moa_webhook(secret, a.header, raw, a.tolerance, a.now)
    print("valid" if ok else "invalid (%s)" % reason)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

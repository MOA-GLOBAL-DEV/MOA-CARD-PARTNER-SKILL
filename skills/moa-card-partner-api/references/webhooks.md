# 알림(웹훅)

상태가 바뀌면 MOA가 파트너사가 등록한 주소로 `POST`를 보낸다. 웹훅 주소와 웹훅 서명 키(`whsec_…`)는 환경(테스트·운영)별로 따로 받는다.

## 1. 전송 형식

| 항목 | 내용 |
|---|---|
| 주소 조건 | `https`, 포트 443 또는 8443, 공개 인터넷에서 접근 가능. 보낼 때마다 DNS를 확인해 비공개 주소로 풀리면 보내지 않는다(알림 내역에 실패로 남음) |
| 메서드 | `POST` |
| `Content-Type` | `application/json` |
| `User-Agent` | `MOA-Webhooks/1.0` |
| `X-Moa-Event-Id` | 알림 ID(`evt_…`). 본문의 `event_id`와 같다 |
| `X-Moa-Event-Type` | 알림 종류(예: `card.activated`) |
| `X-Moa-Signature` | `t=<Unix 초>,v1=<서명 hex>` |
| 수신 성공 | **10초 안에 2xx**. 그 밖(3xx·4xx·5xx·시간 초과)은 실패. 리다이렉트는 따라가지 않는다. 응답 본문은 읽지 않는다 |

본문:

```json
{
  "event_id": "evt_01jbz7h3k5n7q9s1v3x5z7b9d1",
  "type": "card.activated",
  "environment": "test",
  "created_at": "2026-11-06T01:45:31.000Z",
  "data": {
    "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6",
    "card": { "card_id": "card_01jbz4d9f3h5k7n9q1t3w5y7a9", "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6", "product_id": "111100", "masked_number": "999999****5670", "status": "active", "created_at": "2026-11-06T01:42:10.000Z", "activated_at": "2026-11-06T01:45:31.000Z" }
  }
}
```

- `environment`는 `test` 또는 `live`. 테스트·운영 웹훅 주소를 같게 등록했다면 이 값으로 구분하고, 그 환경의 서명 키로 검증한다.

## 2. 서명 검증

```text
X-Moa-Signature: t=1793928225,v1=<hex>
v1 = hex(HMAC-SHA256(key = 웹훅 서명 키(whsec_…) 문자열의 UTF-8 바이트, message = t + "." + 받은 본문 원문))
```

- 본문은 **받은 그대로의 바이트**로 검증한다. JSON으로 파싱한 뒤 다시 직렬화하면 맞지 않는다(프레임워크의 JSON 파서보다 먼저 원문을 확보).
- `t`가 현재 시각과 **300초** 넘게 차이 나면 버린다.
- 비교는 상수 시간 함수(`crypto.timingSafeEqual`, `hmac.compare_digest`, `MessageDigest.isEqual`).
- `t`와 서명은 보낼 때마다(재전송 포함) 새로 계산된다. 본문은 재전송해도 같다.
- 검증 실패면 4xx로 답하고 처리하지 않는다.

검증용 고정값(문서 전용 가짜 키) — `scripts/verify_webhook.mjs --self-test`, `scripts/verify_webhook.py --self-test`:

| 항목 | 값 |
|---|---|
| 웹훅 서명 키 | `whsec_TestWebhookSecretForDocumentationOnly000000` |
| 본문(이 바이트 그대로) | `{"event_id":"evt_01jbz7h3k5n7q9s1v3x5z7b9d1","type":"ping","environment":"test","created_at":"2026-11-06T01:23:45.000Z","data":{"partner_id":"ptn_01jbz0a1b2c3d4e5f6g7h8j9k0"}}` |
| X-Moa-Signature | `t=1793928225,v1=049e6da144aa7c27f1f770f389cba4c8989bd05d5c812329b421f8fecde69694` |

현재 시각을 `1793928225`로 두면 참, 본문을 한 글자라도 바꾸면 거짓이어야 한다.

### Node.js(Express)

```javascript
const crypto = require('node:crypto');
const express = require('express');

function verifyMoaWebhook(secret, signatureHeader, rawBody, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  const parts = {};
  for (const item of String(signatureHeader || '').split(',')) {
    const i = item.indexOf('=');
    if (i > 0) parts[item.slice(0, i).trim()] = item.slice(i + 1).trim();
  }
  if (!/^\d+$/.test(parts.t || '') || !/^[0-9a-fA-F]{64}$/.test(parts.v1 || '')) return false;
  if (Math.abs(nowSec - Number(parts.t)) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(parts.t + '.').update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(parts.v1, 'hex'));
}

const app = express();
// 이 경로는 원문(Buffer)으로 받는다. app.use(express.json())보다 먼저 등록한다
app.post('/webhooks/moa', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!verifyMoaWebhook(process.env.MOA_WEBHOOK_SECRET, req.get('X-Moa-Signature'), req.body)) return res.status(400).end();
  const event = JSON.parse(req.body.toString('utf8'));
  // event_id로 중복을 거른 뒤(아래 3절), 처리는 큐에 넣고 바로 2xx
  res.status(200).end();
});
```

### Python

```python
import hashlib, hmac, re, time

def verify_moa_webhook(secret, signature_header, raw_body, tolerance_sec=300, now=None):
    parts = {}
    for item in (signature_header or "").split(","):
        key, sep, value = item.partition("=")
        if sep:
            parts[key.strip()] = value.strip()
    t, v1 = parts.get("t", ""), parts.get("v1", "")
    if not t.isdigit() or not re.fullmatch(r"[0-9a-fA-F]{64}", v1):
        return False
    now = int(time.time()) if now is None else now
    if abs(now - int(t)) > tolerance_sec:
        return False
    expected = hmac.new(secret.encode("utf-8"), t.encode("ascii") + b"." + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1.lower())

# Flask:   verify_moa_webhook(SECRET, request.headers.get("X-Moa-Signature"), request.get_data())
# FastAPI: raw = await request.body(); verify_moa_webhook(SECRET, request.headers.get("x-moa-signature"), raw)
```

다른 프레임워크: Spring은 `@RequestBody byte[] body`(또는 `String`)로 원문을 받고, NestJS는 `rawBody: true` 옵션의 `req.rawBody`, Next.js Route Handler는 `await req.text()`를 쓴다.

## 3. 재전송과 중복 처리

- 실패하면 **1분, 5분, 30분, 2시간, 6시간, 12시간, 24시간** 뒤 다시 보낸다(첫 전송 포함 최대 8번).
- 모두 실패한 알림(`delivery.status: failed`)은 회사에 요청하면 다시 보낸다. 수신 장애가 있었으면 `GET /events?from=…`로 빠진 알림을 확인한다.
- **같은 `event_id`가 두 번 이상 올 수 있다.** 처리한 `event_id`를 저장해(유니크 제약 권장) 중복을 거른다.
- 도착 순서를 보장하지 않는다. 순서가 중요하면 알림을 받은 뒤 해당 회원·카드·주문을 **조회해 최신 상태**를 쓴다.
- 처리가 길면 먼저 2xx로 답하고 비동기로 처리한다(10초 제한).

권장 수신 처리 순서: ① 원문 확보 → ② 서명·시각 검증(실패 4xx) → ③ `event_id` 중복 확인(이미 처리했으면 바로 2xx) → ④ 큐에 넣거나 저장 → ⑤ 2xx → ⑥ 비동기로 최신 상태 조회·반영.

## 4. 이벤트 종류

| type | 발생 시점 | data |
|---|---|---|
| `kyc.approved` · `kyc.rejected` | 카드 상품별 KYC 승인·거절 | `member_id`, `kyc`(KYC 항목 하나) |
| `order.deposit_confirmed` | 등록·충전 주문의 입금 확인 | `member_id`, `order` |
| `card.registered` | 공카드 등록 완료 | `member_id`, `order`, `card` |
| `card.registration_failed` | 공카드 등록 실패 | `member_id`, `order` |
| `card.activated` | 카드 활성화 완료 | `member_id`, `card` |
| `card.activation_failed` | 카드 활성화 실패(카드 발급사 처리 실패. 테스트 환경에서는 발생하지 않음 — 틀린 활성화 코드는 API 오류로 돌려준다) | `member_id`, `card` |
| `topup.completed` · `topup.failed` | 충전 완료·실패 | `member_id`, `order` |
| `card.status_changed` | 이용 정지·해제, 카드 발급사 차단 등 | `member_id`, `card`, `previous_status` |
| `authorization.approved` · `authorization.declined` | 결제(ATM 포함) 승인·거절 | `member_id`, `transaction` |
| `transaction.posted` | 정산·환불·취소·수수료·조정 반영 | `member_id`, `transaction` |
| `ping` | 회사의 테스트 전송(연결 확인). 알림 내역에는 남지 않는다 | `partner_id` |

- `order`·`card`·`transaction`은 API의 Order·Card·Transaction과 같은 형식(`objects-and-statuses.md`).
- 주문이 유효기간 경과로 취소될 때는 알림을 보내지 않는다.

## 5. payload 예시

아래는 `data` 부분이다(봉투 `event_id`·`type`·`environment`·`created_at`은 1절과 같다).

`kyc.approved`

```json
{ "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6", "kyc": { "product_id": "111100", "status": "approved", "reject_reason_code": null, "reject_reason": null, "updated_at": "2026-11-06T02:10:44.000Z" } }
```

`kyc.rejected`

```json
{ "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6", "kyc": { "product_id": "111100", "status": "rejected", "reject_reason_code": "simulated", "reject_reason": "Rejected in the test environment.", "updated_at": "2026-11-06T02:10:44.000Z" } }
```

`order.deposit_confirmed`(등록 주문)

```json
{
  "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6",
  "order": {
    "order_id": "ord_01jbz4c8e2g4j6m8p0s2v4x6z8", "type": "registration", "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6", "card_id": null,
    "status": "deposit_confirmed", "asset": "USDT", "network": "TRON", "deposit_address": "TEST-DEPOSIT-TRON", "wallet_address": "TExampLeMemberWa11etAddress1234567",
    "amount_due": "120.00", "min_amount": "120.00", "max_amount": "1020.00", "deposit_amount": "125.500000", "deposit_tx_hash": "test_5f0c9a2e7b1d4c3a8e6f2b9d0a1c3e5f",
    "fee_amount": null, "credited_amount": null, "fees": { "registration_fee": "20.00" }, "failure_code": null, "cancel_reason": null,
    "expires_at": "2026-11-06T02:40:00.000Z", "created_at": "2026-11-06T01:40:00.000Z", "updated_at": "2026-11-06T01:42:09.000Z", "completed_at": null
  }
}
```

`card.registered`

```json
{
  "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6",
  "order": {
    "order_id": "ord_01jbz4c8e2g4j6m8p0s2v4x6z8", "type": "registration", "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6", "card_id": "card_01jbz4d9f3h5k7n9q1t3w5y7a9",
    "status": "registered", "asset": "USDT", "network": "TRON", "deposit_address": "TEST-DEPOSIT-TRON", "wallet_address": "TExampLeMemberWa11etAddress1234567",
    "amount_due": "120.00", "min_amount": "120.00", "max_amount": "1020.00", "deposit_amount": "125.500000", "deposit_tx_hash": "test_5f0c9a2e7b1d4c3a8e6f2b9d0a1c3e5f",
    "fee_amount": "20.00", "credited_amount": "105.50", "fees": { "registration_fee": "20.00" }, "failure_code": null, "cancel_reason": null,
    "expires_at": "2026-11-06T02:40:00.000Z", "created_at": "2026-11-06T01:40:00.000Z", "updated_at": "2026-11-06T01:42:10.000Z", "completed_at": "2026-11-06T01:42:10.000Z"
  },
  "card": { "card_id": "card_01jbz4d9f3h5k7n9q1t3w5y7a9", "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6", "product_id": "111100", "masked_number": "999999****5670", "status": "inactive", "created_at": "2026-11-06T01:42:10.000Z", "activated_at": null }
}
```

`card.registration_failed`: `{ "member_id": "…", "order": { …, "status": "failed", "failure_code": "card_unavailable", "card_id": null, "completed_at": "…" } }` (Order 전체 필드가 온다)

`card.activated`: 1절 예시.

`card.activation_failed`: `{ "member_id": "…", "card": { …, "status": "inactive" } }`

`topup.completed`

```json
{
  "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6",
  "order": {
    "order_id": "ord_01jbz5e0g2j4m6p8r0t2w4y6a8", "type": "topup", "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6", "card_id": "card_01jbz4d9f3h5k7n9q1t3w5y7a9",
    "status": "completed", "asset": "USDT", "network": "TRON", "deposit_address": "TEST-DEPOSIT-TRON", "wallet_address": "TExampLeMemberWa11etAddress1234567",
    "amount_due": null, "min_amount": "20.00", "max_amount": "10000.00", "deposit_amount": "100.000000", "deposit_tx_hash": "test_8a1b2c3d4e5f60718293a4b5c6d7e8f9",
    "fee_amount": "2.50", "credited_amount": "97.50", "fees": { "topup_fee_percent": "1.5", "topup_fee_fixed": "0.00", "issuer_fee_percent": "1.0" },
    "failure_code": null, "cancel_reason": null,
    "expires_at": "2026-11-06T02:50:00.000Z", "created_at": "2026-11-06T01:50:00.000Z", "updated_at": "2026-11-06T01:51:30.000Z", "completed_at": "2026-11-06T01:51:30.000Z"
  }
}
```

`topup.failed`: `{ "member_id": "…", "order": { …, "type": "topup", "status": "failed", "failure_code": "amount_below_fees" } }` (또는 `card_not_active`)

`card.status_changed`

```json
{
  "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6",
  "card": { "card_id": "card_01jbz4d9f3h5k7n9q1t3w5y7a9", "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6", "product_id": "111100", "masked_number": "999999****5670", "status": "frozen", "created_at": "2026-11-06T01:42:10.000Z", "activated_at": "2026-11-06T01:45:31.000Z" },
  "previous_status": "active"
}
```

`authorization.approved`(`authorization.declined`는 `status: "declined"`, 잔액 변화 없음)

```json
{
  "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6",
  "transaction": {
    "transaction_id": "txn_01jbz6f1h3k5n7q9s1v3x5z7b9", "card_id": "card_01jbz4d9f3h5k7n9q1t3w5y7a9", "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6",
    "type": "payment", "status": "approved", "amount": "12.30", "currency": "USD", "fee": "0.00",
    "merchant": { "name": "STARBUCKS", "category_code": "5814", "country": "KR" },
    "original_transaction_id": null, "occurred_at": "2026-11-06T02:00:01.000Z", "created_at": "2026-11-06T02:00:02.000Z"
  }
}
```

`transaction.posted`(환불 예)

```json
{
  "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6",
  "transaction": {
    "transaction_id": "txn_01jbz6g2j4m6p8r0t2w4y6a8c0", "card_id": "card_01jbz4d9f3h5k7n9q1t3w5y7a9", "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6",
    "type": "refund", "status": "settled", "amount": "12.30", "currency": "USD", "fee": "0.00",
    "merchant": { "name": "STARBUCKS", "category_code": "5814", "country": "KR" },
    "original_transaction_id": "txn_01jbz6f1h3k5n7q9s1v3x5z7b9", "occurred_at": "2026-11-06T03:00:01.000Z", "created_at": "2026-11-06T03:00:02.000Z"
  }
}
```

`ping`

```json
{ "partner_id": "ptn_01jbz0a1b2c3d4e5f6g7h8j9k0" }
```

## 6. 알림 내역 API

- `GET /events?type=&from=&to=`(페이지, `type`은 쉼표로 여러 개), `GET /events/{event_id}`(없으면 `404 event_not_found`).
- 각 항목에 전송 결과 `delivery`(`pending`·`succeeded`·`failed`, `attempts`, `last_status_code`, `last_attempt_at`). 웹훅 주소가 없던 때의 알림은 `delivery: null`.
- 수신 장애 복구: 장애 시작 시각을 `from`으로 조회 → 처리하지 않은 `event_id`만 처리(같은 중복 제거 로직 사용).

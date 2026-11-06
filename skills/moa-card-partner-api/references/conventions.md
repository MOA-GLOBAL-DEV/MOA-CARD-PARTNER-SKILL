# 공통 규약: 형식·봉투·페이지·요청 추적·오류·본문 제한

Base URL: `https://api.moacard.io/partner/v1` (HTTPS만). 테스트·운영이 같은 주소를 쓰고, 어느 환경인지는 API Key로 정해진다(`pk_test_` 테스트, `pk_live_` 운영). 활성화되지 않은 운영 키는 `403 environment_unavailable`.

## 1. 값 형식

| 항목 | 규칙 |
|---|---|
| 형식 | 요청·응답 모두 UTF-8 JSON. 본문이 있으면 `Content-Type: application/json`. 파일(KYC 서류)도 JSON 안에 base64 |
| 시각 | ISO 8601 UTC 문자열(`2026-11-06T01:23:45.000Z`). 날짜만 쓰는 필드는 `YYYY-MM-DD` |
| 금액 | **문자열**(`"100.00"`). USD, 소수 2자리. 입금 자산 수량 `deposit_amount`만 소수 6자리(`"105.500000"`). 부동소수점으로 바꿔 계산하지 않는다(decimal/BigDecimal/정수 센트) |
| 요율 | 퍼센트 문자열(`"1.5"` = 1.5%) |
| ID | 접두어 붙은 문자열. 접두어 뒤 형식에 의존하지 않는다 |
| 없는 값 | 필드를 빼지 않고 `null` |
| 알 수 없는 필드 | 요청 본문의 정해지지 않은 필드는 무시된다. 응답에 필드가 추가될 수 있으니 모르는 필드는 무시하도록 구현 |
| 캐시 | 모든 응답에 `Cache-Control: no-store` |

ID 접두어: `mem_` 회원, `card_` 카드, `ord_` 주문(등록·충전), `txn_` 거래, `evt_` 알림, `doc_` KYC 서류, `req_` 요청 추적, `ptn_` 파트너사.

## 2. 성공 응답 봉투

```json
{ "request_id": "req_01jbz3k8m2q4r6t8v0w2y4a6c8", "data": { "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6" } }
```

페이지가 있는 목록(회원, 등록 주문, 충전 주문, 거래, 알림):

```json
{
  "request_id": "req_01jbz3m9n1p3q5r7s9t1v3w5x7",
  "data": [ { "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6", "partner_member_id": "u-1029", "email": "user@example.com", "link_status": "linked", "kyc": [], "created_at": "2026-11-06T01:23:45.120Z" } ],
  "has_more": true,
  "next_cursor": "c_WyIyMDI2LTExLTA2VDAxOjIzOjQ1LjEyMDAwMFoiLCJtZW1fMDFqYnoyeDdkNWY5aDNrNm44cDByMnQ0djYiXQ"
}
```

크기가 정해진 목록(국가·도시 코드, 상품, KYC 상태, 회원의 카드, 입금 자산, 테스트 공카드)은 `data` 배열만 준다(`has_more`·`next_cursor` 없음).

## 3. 목록 조회(커서 페이지)

| 쿼리 | 타입 | 설명 |
|---|---|---|
| `limit` | 정수 | 1~100, 기본 20 |
| `cursor` | string | 앞 응답의 `next_cursor`. 첫 페이지에서는 보내지 않는다. 내용을 해석하지 않고 그대로 돌려보낸다 |
| `from` | ISO 8601 | 생성 시각이 이 값 **이상** |
| `to` | ISO 8601 | 생성 시각이 이 값 **미만** |

- 정렬은 최신순(생성 시각 내림차순).
- `has_more: true`면 같은 쿼리에 `cursor=<next_cursor>`를 더해 다음 페이지. `false`면 `next_cursor: null`.
- `from`·`to`는 시간대를 포함한 ISO 8601(`Z` 권장). `+09:00`의 `+`는 `%2B`로 인코딩. 날짜만(`2026-11-06`) 쓰면 그날 0시(UTC).
- 같은 쿼리 이름을 두 번 보내면 `400 invalid_request`. 형식이 틀린 `limit`·`cursor`·`from`·`to`도 `400`(`details`에 필드).
- 목록별 추가 필터: 회원 `partner_member_id` / 등록 주문 `member_id`, `status` / 충전 주문 `member_id`, `card_id`, `status` / 거래 `member_id`, `card_id`, `type`(쉼표로 여러 개) / 알림 `type`(쉼표로 여러 개).

전체 순회 예(Node, `scripts/partner_client.mjs` 사용):

```javascript
let cursor;
do {
  const r = await moa.call('GET', '/transactions', undefined, { query: { card_id, limit: 100, cursor } });
  for (const t of r.body.data) handle(t);
  cursor = r.body.has_more ? r.body.next_cursor : undefined;
} while (cursor);
```

## 4. 요청 추적 ID

- 모든 응답(오류·없는 경로 포함)에 `X-Request-Id` 헤더. 본문의 `request_id`와 같은 값(`req_…`).
- 회사에 문의할 때 이 값을 알려 준다. 파트너사 로그에 요청마다 남긴다(키 ID·경로·상태 코드·요청 고유키와 함께. 비밀키·PIN·카드번호는 남기지 않는다).
- 같은 요청 고유키로 처음 응답을 다시 받은 경우(멱등 재전송), 본문의 `request_id`는 처음 값이고 `X-Request-Id`는 이번 요청 값이다.

## 5. 오류 형식

```json
{
  "request_id": "req_01jbz3k8m2q4r6t8v0w2y4a6c8",
  "error": {
    "code": "kyc_not_approved",
    "message": "KYC for product 111100 is not approved.",
    "user_message": { "ko": "KYC 승인 후 카드를 등록할 수 있습니다.", "en": "Please complete KYC before registering a card." },
    "retryable": false,
    "related": { "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6" }
  }
}
```

| 필드 | 설명 |
|---|---|
| `code` | 오류 코드. **프로그램은 이 값으로만 분기**한다(`errors.md`) |
| `message` | 개발자용 영문. 문구가 바뀔 수 있으니 분기에 쓰지 않고 회원 화면에 그대로 보여 주지 않는다 |
| `user_message` | 회원 안내 문구(`ko`·`en`). 회원 화면에 보여 줄 수 있다 |
| `retryable` | `true`면 같은 요청을 그대로 다시 보내도 된다(POST는 같은 요청 고유키, 새 시각·서명) |
| `related` | 관련된 `member_id`, `card_id`, `order_id`, `transaction_id` 중 있는 것만 |
| `details` | 일부 오류에만. `400 invalid_request`는 필드 경로별 사유, `422 amount_out_of_range`는 `min`·`max`, `422 deposit_not_matched`는 `reason`, `422 document_invalid`·`422 document_not_found`는 해당 필드 |

`400 invalid_request`의 `details` 예:

```json
{
  "request_id": "req_01jbz3m9n1p3q5r7s9t1v3w5x7",
  "error": {
    "code": "invalid_request",
    "message": "Request body validation failed.",
    "user_message": { "ko": "요청 형식이 올바르지 않습니다.", "en": "The request is invalid." },
    "retryable": false,
    "related": { "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6" },
    "details": {
      "address.line": "Too big: expected string to have <=40 characters",
      "id_document.expiry_date": "The ID document has expired"
    }
  }
}
```

- `details`의 사유 문구는 바뀔 수 있다. **키(필드 경로)**로 어느 입력이 틀렸는지 판단한다. 본문 전체 오류는 키가 `body`, 헤더 오류는 헤더 이름(`Idempotency-Key`)이다.
- 네트워크 앞단의 `429`는 JSON 본문이 없을 수 있다.

## 6. 본문 크기·인코딩

- 요청 본문은 **64KB**까지. KYC 서류 등록(`POST /members/{member_id}/kyc/documents`)만 **4MB**까지. 넘으면 `400 invalid_request`.
- 압축 본문(`Content-Encoding: gzip` 등)은 받지 않는다(`400 invalid_request`).
- 본문이 JSON이 아니면 `400 invalid_request`(`Request body is not valid JSON.`). 본문이 없는 POST(취소·정지 등)는 본문을 비워 보낸다(빈 문자열의 SHA-256으로 서명).

## 7. 환경 구분

| 환경 | API Key | 내용 |
|---|---|---|
| 테스트 | `pk_test_…` / `sk_test_…` | 입금 확인·KYC 결과·카드 등록·활성화·결제를 모의로 처리. 실제 자산을 보내지 않는다. 테스트 전용 API(`test-environment.md`) 사용 가능 |
| 운영 | `pk_live_…` / `sk_live_…` | 실제 카드 발급사와 연결. 운영 키가 활성화되기 전에는 `403 environment_unavailable` |

- 테스트·운영의 데이터(회원, 카드, 주문, 거래, 알림)는 섞이지 않는다. 테스트 키로 만든 회원은 운영 키로 조회되지 않는다.
- 허용 IP·웹훅 주소·웹훅 서명 키는 환경별로 따로다.

# 엔드포인트 전체(41개)

- 경로는 Base URL `https://api.moacard.io/partner/v1` 뒤의 부분이다. **서명 원문에는 `/partner/v1`부터** 쓴다.
- 모든 POST는 `Idempotency-Key`가 필요하다(본문 없는 POST 포함). "본문 없음"인 POST는 본문을 비워 보낸다.
- "제약"은 서버 검증 규칙이다. 어기면 따로 적지 않은 한 `400 invalid_request`(`error.details`에 필드 경로).
- 응답은 모두 `{ "request_id", "data" }` 봉투다(`conventions.md`). 아래 예시는 `data`만 보이거나 봉투째 보인다. ID·시각·금액은 예시 값이다.
- 객체 필드 설명과 상태값은 `objects-and-statuses.md`, 오류 코드 전체는 `errors.md`.
- 모든 엔드포인트 공통 오류(따로 적지 않음): `401 authentication_failed`, `403 ip_not_allowed`·`partner_suspended`·`environment_unavailable`, `429 rate_limited`, `500 internal_error`.

## 목록

| # | 메서드 | 경로 | 기능 | 성공 |
|---|---|---|---|---|
| 1 | GET | `/ping` | 연결 확인 | 200 |
| 2 | GET | `/pin-encryption-key` | PIN 암호화 공개키 | 200 |
| 3 | POST | `/members` | 회원 등록 | 201 / 200 |
| 4 | GET | `/members` | 회원 목록·파트너사 회원 ID로 찾기 | 200 페이지 |
| 5 | GET | `/members/{member_id}` | 회원 조회 | 200 |
| 6 | POST | `/members/{member_id}/email-verification` | 이메일 인증번호 요청 | 200 |
| 7 | POST | `/members/{member_id}/email-verification/confirm` | 이메일 인증번호 확인 | 200 |
| 8 | GET | `/kyc/countries` | KYC 국가 코드 | 200 |
| 9 | GET | `/kyc/countries/{code}/cities` | KYC 도시 코드 | 200 |
| 10 | POST | `/members/{member_id}/kyc/documents` | KYC 서류 등록 | 201 |
| 11 | POST | `/members/{member_id}/kyc` | KYC 신청·재신청 | 202 |
| 12 | GET | `/members/{member_id}/kyc` | KYC 상태 | 200 |
| 13 | GET | `/products` | 카드 상품·이용 조건 | 200 |
| 14 | GET | `/topup/options` | 입금 자산·네트워크 | 200 |
| 15 | POST | `/members/{member_id}/registration-orders` | 공카드 등록 신청(등록 주문) | 201 |
| 16 | GET | `/registration-orders` | 등록 주문 목록 | 200 페이지 |
| 17 | GET | `/registration-orders/{order_id}` | 등록 주문 조회 | 200 |
| 18 | POST | `/registration-orders/{order_id}/cancel` | 등록 주문 취소 | 200 |
| 19 | POST | `/cards/{card_id}/activate` | 카드 활성화 | 200 |
| 20 | GET | `/members/{member_id}/cards` | 회원의 카드 목록 | 200 |
| 21 | GET | `/cards/{card_id}` | 카드 조회 | 200 |
| 22 | GET | `/cards/{card_id}/balance` | 잔액 조회 | 200 |
| 23 | POST | `/cards/{card_id}/sensitive` | 카드 상세정보(JWE) | 200 |
| 24 | POST | `/cards/{card_id}/pin-verification` | PIN 변경 인증번호 요청 | 200 |
| 25 | POST | `/cards/{card_id}/pin` | PIN 변경 | 200 |
| 26 | POST | `/cards/{card_id}/freeze` | 이용 정지 | 200 |
| 27 | POST | `/cards/{card_id}/unfreeze` | 정지 해제 | 200 |
| 28 | GET | `/cards/{card_id}/topup-quote` | 충전 수수료 미리보기 | 200 |
| 29 | POST | `/cards/{card_id}/topup-orders` | 충전 주문 생성 | 201 |
| 30 | GET | `/topup-orders` | 충전 주문 목록 | 200 페이지 |
| 31 | GET | `/topup-orders/{order_id}` | 충전 주문 조회 | 200 |
| 32 | POST | `/topup-orders/{order_id}/cancel` | 충전 주문 취소 | 200 |
| 33 | GET | `/transactions` | 거래 내역 검색 | 200 페이지 |
| 34 | GET | `/transactions/{transaction_id}` | 거래 조회 | 200 |
| 35 | GET | `/events` | 알림 내역 | 200 페이지 |
| 36 | GET | `/events/{event_id}` | 알림 조회 | 200 |
| 37 | GET | `/test/card-inventory` | [테스트] 테스트 공카드 목록 | 200 |
| 38 | POST | `/test/members/{member_id}/kyc-result` | [테스트] KYC 결과 만들기 | 200 |
| 39 | POST | `/test/orders/{order_id}/deposit` | [테스트] 입금 만들기 | 200 |
| 40 | POST | `/test/cards/{card_id}/transactions` | [테스트] 거래 만들기 | 201 |
| 41 | POST | `/test/cards/{card_id}/block` | [테스트] 카드 발급사 차단 흉내 | 200 |

---

## 연결·키

### 1. GET /ping

키·서명·허용 IP 확인. 응답 `data`:

```json
{ "partner_id": "ptn_01jbz0a1b2c3d4e5f6g7h8j9k0", "environment": "test", "key_id": "pk_test_DocExample000001", "client_ip": "203.0.113.10" }
```

### 2. GET /pin-encryption-key

PIN을 회원 기기에서 암호화할 회사 공개키. 파트너사 서버가 받아 앱에 내려 준다(캐시 가능, `key_id`가 바뀌면 다시 받는다).

```json
{ "key_id": "pin-1", "algorithm": "RSA-OAEP-256", "public_key": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0B...\n-----END PUBLIC KEY-----\n" }
```

- `public_key`는 SPKI PEM(예시는 줄인 값). JWE 헤더 `kid`에 `key_id`를 넣는다. 현재 키는 하나이고, `kid`가 현재 `key_id`와 다르면 `422 pin_invalid`.
- 오류: `503 issuer_unavailable`(회사 쪽 키 일시 문제. 잠시 뒤 재시도).

---

## 회원

### 3. POST /members — 회원 등록

| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `email` | string | Y | 앞뒤 공백 제거·소문자로 바꿔 검사·저장. 255자 이하, 이메일 형식 |
| `partner_member_id` | string | Y | 1~128자, 제어 문자 불가. 대소문자 구분 |

```json
{ "email": "user@example.com", "partner_member_id": "u-1029" }
```

성공: 새 회원 `201` + Member, 이미 같은 `partner_member_id`·같은 이메일로 등록된 회원이면 `200` + 기존 Member.

```json
{
  "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6",
  "partner_member_id": "u-1029",
  "email": "user@example.com",
  "link_status": "verification_required",
  "kyc": [ { "product_id": "111100", "status": "not_submitted", "reject_reason_code": null, "reject_reason": null, "updated_at": null } ],
  "created_at": "2026-11-06T01:23:45.120Z"
}
```

- 응답은 회사에 이미 있는 이메일이든 새 이메일이든 같다(이용 여부를 드러내지 않음). 다음 단계는 이메일 인증(6·7).
- 멱등 재전송 시 `data: null`(이메일 보호). `GET /members/{member_id}`로 다시 읽는다.
- 회원 이메일 변경은 제공하지 않는다. 한 `partner_member_id`에는 한 이메일.

오류: `409 member_id_conflict`(같은 `partner_member_id`에 다른 이메일, `related.member_id`=기존 회원), `409 email_already_registered`(같은 이메일이 다른 `partner_member_id`로), `409 request_in_progress`(같은 회원 동시 등록 → 같은 키로 재시도), `400 invalid_request`.

### 4. GET /members — 회원 목록

쿼리: `partner_member_id`(선택, 정확히 일치 → 0~1건), `limit`·`cursor`·`from`·`to`. 응답: Member 배열 + `has_more`·`next_cursor`.

### 5. GET /members/{member_id} — 회원 조회

응답: Member. 오류: `404 member_not_found`(없거나 다른 파트너사·환경의 회원).

### 6. POST /members/{member_id}/email-verification — 인증번호 요청

본문 없음. `link_status: verification_required`인 회원만.

```json
{ "sent_to": "u***@example.com", "expires_at": "2026-11-06T01:34:00.000Z" }
```

- 회원 이메일로 6자리 인증번호(10분 유효). 테스트 환경은 메일을 보내지 않고 항상 `000000`.
- 1분 안 재요청 `429 rate_limited`(`Retry-After`), 회원당 하루(UTC) 5번 초과 `429`(`Retry-After`=다음 날 0시까지 초), 잠김 상태 `429`.
- `sent_to`는 가린 이메일. 화면에 "u***@example.com으로 보냈습니다"처럼 쓸 수 있다.

오류: `404 member_not_found`, `409 invalid_state`(이미 `linked`), `429 rate_limited`.

### 7. POST /members/{member_id}/email-verification/confirm — 인증번호 확인

| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `code` | string | Y | 1~16자(회원이 받은 6자리 인증번호) |

성공: `200` + Member(`link_status: linked`). 같은 이메일로 이미 승인된 KYC가 있으면 바로 `approved`로 보인다. 멱등 재전송 시 `data: null`.

- 틀린 입력은 회원당 24시간에 5번까지. **다섯 번째로 틀리면 `422 verification_locked`**, 24시간 동안 확인과 재요청(`429`) 모두 거절. 새 번호를 받아도 횟수는 줄지 않는다.

오류: `422 invalid_verification_code`, `422 verification_code_expired`(요청 안 함·10분 경과 → 새로 요청), `422 verification_locked`, `409 invalid_state`(이미 `linked`), `404 member_not_found`.

---

## KYC

### 8. GET /kyc/countries

KYC를 받는 국가(이름순). 페이지 없음.

```json
[ { "code": "KR", "name": "Korea, Republic of" } ]
```

### 9. GET /kyc/countries/{code}/cities

그 국가의 도시(이름순). `code`는 ISO 3166-1 alpha-2(대소문자 무관). 도시 코드 형식은 국가마다 다르므로 응답 값을 그대로 쓴다.

```json
[ { "code": "<도시 코드>", "name": "Seoul" } ]
```

오류: `404 not_found`(없거나 KYC를 받지 않는 국가 코드).

### 10. POST /members/{member_id}/kyc/documents — 서류 등록

본문 **4MB**까지 받는 유일한 API. 서류 3장(`id_front`, `id_back`, `selfie`)을 각각 등록한다.

| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `type` | string | Y | `id_front`(신분증 앞면), `id_back`(뒷면), `selfie`(신분증을 든 본인 사진) |
| `content_type` | string | Y | `image/jpeg`, `image/png`, `application/pdf` 중 하나(그 밖은 `422 document_invalid`) |
| `file_base64` | string | Y | 표준 base64(`+`,`/`,`=` 패딩, 줄바꿈 허용). `data:…;base64,` 접두어 넣지 않음. 디코딩한 파일 1바이트~2MB. 파일 앞부분(파일 서명)이 `content_type`과 맞아야 함 |

```json
{ "type": "id_front", "content_type": "image/jpeg", "file_base64": "/9j/4AAQSkZJRgABAQAAAQABAAD..." }
```

성공 `201`:

```json
{ "document_id": "doc_01jbz3a0b1c2d3e4f5g6h7j8k9", "type": "id_front", "created_at": "2026-11-06T01:30:12.004Z" }
```

오류: `422 document_invalid`(형식·base64·빈 파일·2MB 초과·형식과 내용 불일치, `details`에 필드), `404 member_not_found`, `400 invalid_request`(필드 누락, 본문 4MB 초과), `503 issuer_unavailable`.

### 11. POST /members/{member_id}/kyc — KYC 신청·재신청

조건: 이메일 인증을 마친 회원(`linked`). 허용 상품 중 대기·심사 중인 상품이 없고, 승인되지 않은 상품(`not_submitted`·`rejected`)이 있을 때.

| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `first_name` | string | Y | 2~32자, 대문자 A~Z, 단어 사이 공백 한 칸(`^[A-Z]+( [A-Z]+)*$`) |
| `last_name` | string | Y | `first_name`과 같음 |
| `birth_date` | string | Y | `YYYY-MM-DD`, 오늘(UTC)보다 이전 |
| `gender` | string | Y | `male`, `female` |
| `nationality` | string | Y | ISO 3166-1 alpha-2 대문자 |
| `phone.country_code` | string | Y | 숫자 1~4자리(`+` 없이, 예 `82`) |
| `phone.number` | string | Y | 숫자 5~15자리(예 `1012345678`) |
| `address.country` | string | Y | 대문자 2자리 + `GET /kyc/countries`에 있어야 함 |
| `address.city` | string | Y | 1~50자 + `GET /kyc/countries/{code}/cities`에 있어야 함 |
| `address.line` | string | Y | 앞뒤 공백 제거 후 1~40자(영문 권장) |
| `address.postal_code` | string | Y | 앞뒤 공백 제거 후 1~20자 |
| `occupation` | string | N | 1~100자. 없으면 카드 발급사 기본값 |
| `annual_income` | string | N | 1~100자 |
| `account_purpose` | string | N | 1~100자 |
| `expected_monthly_volume` | string | N | 1~100자 |
| `id_document.type` | string | Y | `passport`, `national_id`, `driving_license` |
| `id_document.number` | string | Y | 1~50자, 영문·숫자·공백·하이픈 |
| `id_document.issue_date` | string | Y | `YYYY-MM-DD`, 오늘(UTC) 이후일 수 없음 |
| `id_document.expiry_date` | string | Y | `YYYY-MM-DD`, 발급일 뒤이고 오늘(UTC) 이후(오늘 포함) |
| `documents.id_front` | string | Y | 10번에서 받은 이 회원의 `id_front` 서류 ID(1~64자) |
| `documents.id_back` | string | Y | 이 회원의 `id_back` 서류 ID |
| `documents.selfie` | string | Y | 이 회원의 `selfie` 서류 ID |
| `client_ip` | string | Y | **회원의** 접속 IPv4(파트너사 서버 IP가 아님) |

```json
{
  "first_name": "GILDONG",
  "last_name": "HONG",
  "birth_date": "1990-01-31",
  "gender": "male",
  "nationality": "KR",
  "phone": { "country_code": "82", "number": "1012345678" },
  "address": { "country": "KR", "city": "SEOUL", "line": "123 Teheran-ro", "postal_code": "06234" },
  "occupation": "Software Engineer",
  "annual_income": "50000-100000",
  "account_purpose": "Online shopping",
  "expected_monthly_volume": "1000",
  "id_document": { "type": "passport", "number": "M12345678", "issue_date": "2020-01-01", "expiry_date": "2030-01-01" },
  "documents": {
    "id_front": "doc_01jbz3a0b1c2d3e4f5g6h7j8k9",
    "id_back": "doc_01jbz3a1m2n3p4q5r6s7t8v9w0",
    "selfie": "doc_01jbz3a2x3y4z5a6b7c8d9e0f1"
  },
  "client_ip": "203.0.113.10"
}
```

※ `"SEOUL"`은 자리표시 값. 실제로는 9번이 준 도시 코드를 넣는다. 이메일은 본문에 넣지 않는다(회원 등록 때 이메일 사용).

성공 `202` + KYC 상태 목록(보통 `pending` 또는 `in_review`):

```json
[ { "product_id": "111100", "status": "in_review", "reject_reason_code": null, "reject_reason": null, "updated_at": "2026-11-06T01:31:02.410Z" } ]
```

- **재신청**도 같은 경로. 서류를 바꾸려면 새로 등록한 서류 ID를 넣는다.

오류: `400 invalid_request`(형식, 없는 `address.country`·`address.city`), `409 member_verification_required`, `409 kyc_already_approved`(허용 상품 모두 승인, 공유된 승인 포함), `409 kyc_in_review`(대기·심사 중 상품 있음), `409 invalid_state`(파트너사에 허용된 상품 없음 → 회사 문의), `422 document_not_found`(서류 ID 없음·다른 회원·종류 불일치, `details`에 `documents.<type>`), `422 id_document_already_used`(같은 신분증이 다른 이메일의 승인·심사 중 KYC에 사용됨 → 다른 종류의 신분증), `404 member_not_found`, `503 issuer_unavailable`(같은 키로 재시도).

### 12. GET /members/{member_id}/kyc — KYC 상태

허용 상품마다 한 항목(페이지 없음). 이메일 인증 전 회원은 모두 `not_submitted`.

```json
[ { "product_id": "111100", "status": "rejected", "reject_reason_code": "document_unclear", "reject_reason": "The ID document image is not clear.", "updated_at": "2026-11-06T02:10:44.000Z" } ]
```

오류: `404 member_not_found`.

---

## 상품·입금 자산

### 13. GET /products — 카드 상품·이용 조건

파트너사에 허용된 상품(페이지 없음). 이용 조건·수수료는 바뀔 수 있으니 화면에 보여 주기 전에 다시 조회한다.

```json
[
  {
    "product_id": "111100",
    "name": "MOA Physical Card",
    "brand": "VISA",
    "activation_amount": { "min": "100.00", "max": "1000.00" },
    "topup_amount": { "min": "20.00", "max": "10000.00" },
    "supported_nationalities": ["KR", "JP", "SG"],
    "supported_regions": ["KR", "JP", "SG"],
    "fees": {
      "registration": { "fixed": "20.00" },
      "topup": { "issuer_percent": "1.0", "percent": "1.5", "fixed": "0.00" },
      "payment": { "percent": "1.2", "fixed": "0.00" },
      "atm": { "percent": "2.0", "fixed": "2.50" }
    }
  }
]
```

### 14. GET /topup/options — 입금 자산·네트워크

등록 주문과 충전 주문이 같은 목록을 쓴다. 자산은 스테이블코인(1개 = 1 USD). 바뀔 수 있으니 주문 화면을 열 때 조회한다.

```json
[ { "asset": "USDC", "network": "BASE" }, { "asset": "USDT", "network": "TRON" } ]
```

---

## 등록 주문(공카드 등록)

### 15. POST /members/{member_id}/registration-orders — 공카드 등록 신청

조건: 공카드가 이 파트너사에 공급된 카드, 회원이 `linked`, 그 카드 상품의 KYC `approved`, 회원에게 진행 중인 주문 없음(등록·충전 합쳐 1건).

| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `card_number` | string | Y | 숫자 13~19자리(공백·하이픈 없이) |
| `asset` | string | Y | 1~20자, 대소문자 무관(대문자로 바꿈). `GET /topup/options`에 있어야 함(없으면 `422 unsupported_asset`) |
| `network` | string | Y | `asset`과 같은 규칙 |
| `wallet_address` | string | Y | 1~128자 + 네트워크 형식(아니면 `422 wallet_address_invalid`): EVM(ETH·ARBITRUM·BSC·BASE·POL·AVAXC 등) `0x`+16진수 40자리(대소문자 무관), TRON `T`로 시작하는 base58 34자리, Solana(SOL) base58 32~44자리 |

```json
{ "card_number": "9999990012345670", "asset": "USDT", "network": "TRON", "wallet_address": "TExampLeMemberWa11etAddress1234567" }
```

성공 `201` + Order:

```json
{
  "order_id": "ord_01jbz4c8e2g4j6m8p0s2v4x6z8",
  "type": "registration",
  "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6",
  "card_id": null,
  "status": "awaiting_deposit",
  "asset": "USDT",
  "network": "TRON",
  "deposit_address": "TEST-DEPOSIT-TRON",
  "wallet_address": "TExampLeMemberWa11etAddress1234567",
  "amount_due": "120.00",
  "min_amount": "120.00",
  "max_amount": "1020.00",
  "deposit_amount": null,
  "deposit_tx_hash": null,
  "fee_amount": null,
  "credited_amount": null,
  "fees": { "registration_fee": "20.00" },
  "failure_code": null,
  "cancel_reason": null,
  "expires_at": "2026-11-06T02:40:00.000Z",
  "created_at": "2026-11-06T01:40:00.000Z",
  "updated_at": "2026-11-06T01:40:00.000Z",
  "completed_at": null
}
```

- `amount_due` = `min_amount` = 상품 `activation_amount.min` + 등록 수수료. `max_amount` = `activation_amount.max` + 등록 수수료.
- 유효기간 60분(`expires_at`). 회원에게 입금 주소·자산·네트워크·`amount_due`·유효기간을 안내한다. 예시의 `deposit_address`는 테스트 자리표시 값.
- 카드 번호 원문은 저장되지 않는다(가린 번호·참조값만).

오류(검사 순서대로): `409 member_verification_required`, `422 card_not_assigned`(공급되지 않은 공카드·허용되지 않은 상품), `409 card_already_registered`(이미 등록, 또는 다른 회원의 같은 카드 등록 주문 진행 중), `422 kyc_not_approved`, `422 unsupported_asset`, `422 wallet_address_invalid`, `409 order_in_progress`, `409 wallet_address_in_use`(같은 자산·네트워크·입금 주소로 같은 지갑에서 입금 대기 중인 다른 주문 — 다른 회원·파트너사 포함), `404 member_not_found`, `503 issuer_unavailable`.

### 16. GET /registration-orders — 등록 주문 목록

쿼리: `member_id`, `status`(`awaiting_deposit`·`deposit_confirmed`·`registered`·`failed`·`cancelled` 외에는 `400`), `limit`·`cursor`·`from`·`to`. 응답: Order 배열 + 페이지.

### 17. GET /registration-orders/{order_id} — 등록 주문 조회

응답: Order. 오류: `404 order_not_found`(충전 주문 ID를 넣어도 404).

### 18. POST /registration-orders/{order_id}/cancel — 등록 주문 취소

본문 없음. `awaiting_deposit`일 때만. 성공 `200` + Order(`status: cancelled`, `cancel_reason: partner_request`, 이미 유효기간이 지났으면 `expired`).

오류: `409 invalid_state`(그 밖의 상태), `404 order_not_found`.

---

## 카드

### 19. POST /cards/{card_id}/activate — 카드 활성화

조건: 카드 `inactive`.

| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `activation_code` | string | Y | 앞뒤 공백 제거 후 1~32자. 카드 발급사가 회원 이메일로 보낸 코드(테스트 `123456`) |
| `encrypted_pin` | string | Y | 1~4096자. 회원 기기에서 만든 JWE compact(`{"pin":"NNNNNN"}`, `RSA-OAEP-256`+`A256GCM`, `kid`) |

```json
{ "activation_code": "123456", "encrypted_pin": "eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIiwia2lkIjoicGluLTEifQ.<키>.<IV>.<암호문>.<태그>" }
```

성공 `200` + Card(`status: active`), 알림 `card.activated`.

- `encrypted_pin`을 먼저 확인(`422 pin_invalid`)한 뒤 활성화 코드를 확인한다.
- 활성화 코드는 카드당 24시간에 5번까지. **다섯 번째로 틀리면 `422 verification_locked`**, 24시간 동안 맞는 코드도 거절.

오류: `422 pin_invalid`, `422 invalid_activation_code`, `422 verification_locked`, `409 invalid_state`(`inactive` 아님), `404 card_not_found`, `503 issuer_unavailable`(같은 키로 재시도).

### 20. GET /members/{member_id}/cards — 회원의 카드

최신순 Card 배열(페이지 없음). 이 파트너사에 공급된 공카드로 등록된 카드만 보인다. 오류: `404 member_not_found`.

### 21. GET /cards/{card_id} — 카드 조회

```json
{
  "card_id": "card_01jbz4d9f3h5k7n9q1t3w5y7a9",
  "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6",
  "product_id": "111100",
  "masked_number": "999999****5670",
  "status": "active",
  "created_at": "2026-11-06T01:42:10.000Z",
  "activated_at": "2026-11-06T01:45:31.000Z"
}
```

오류: `404 card_not_found`(없거나 다른 파트너사·환경의 카드).

### 22. GET /cards/{card_id}/balance — 잔액

```json
{ "card_id": "card_01jbz4d9f3h5k7n9q1t3w5y7a9", "available_balance": "190.70", "currency": "USD", "updated_at": "2026-11-06T02:05:12.000Z" }
```

오류: `404 card_not_found`.

### 23. POST /cards/{card_id}/sensitive — 카드 상세정보

카드번호·유효기간·CVV를 **회원 기기 공개키**로 암호화해 준다. 조회지만 공개키를 본문으로 받으므로 POST. 요청 고유키는 필요하지만 응답은 저장되지 않는다. 조건: 카드 `active`·`frozen`, 카드당 시간당 10번.

| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `public_key` | string | Y | 1~8192자. 회원 기기에서 만든 RSA 공개키 SPKI PEM(`-----BEGIN PUBLIC KEY-----`), 2048비트 이상(아니면 `422 public_key_invalid`) |

```json
{ "card_id": "card_01jbz4d9f3h5k7n9q1t3w5y7a9", "encrypted": "eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIn0.<키>.<IV>.<암호문>.<태그>" }
```

- `encrypted`는 JWE compact(`RSA-OAEP-256` + `A256GCM`). 복호화한 평문: `{"pan":"9999990012345670","expiry_month":"12","expiry_year":"2029","cvv":"123"}`.
- 파트너사 서버는 `encrypted`를 저장·로그하지 않고 앱에 그대로 전달한다(`flows.md` 4절).

오류: `422 public_key_invalid`, `409 invalid_state`, `429 rate_limited`(`Retry-After`), `502 issuer_error`, `404 card_not_found`.

### 24. POST /cards/{card_id}/pin-verification — PIN 변경 인증번호 요청

본문 없음. 카드 `active`·`frozen`. 회원 이메일로 6자리(10분 유효, 테스트 `000000`).

```json
{ "sent_to": "u***@example.com", "expires_at": "2026-11-06T02:20:00.000Z" }
```

오류: `429 rate_limited`(1분 안 재요청, 카드당 하루(UTC) 5번 초과, 잠김), `409 invalid_state`, `404 card_not_found`.

### 25. POST /cards/{card_id}/pin — PIN 변경

| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `verification_code` | string | Y | 1~16자(받은 6자리 인증번호) |
| `encrypted_pin` | string | Y | 1~4096자, 새 PIN의 JWE(19번과 같은 형식) |

성공 `200` + Card. `encrypted_pin`을 먼저 확인하고 인증번호를 확인한다. 맞으면 그 인증번호는 다시 쓸 수 없다. 틀린 입력은 카드당 24시간에 5번(다섯 번째 `422 verification_locked`).

오류: `422 pin_invalid`, `422 invalid_verification_code`, `422 verification_code_expired`, `422 verification_locked`, `409 invalid_state`, `404 card_not_found`.

### 26. POST /cards/{card_id}/freeze — 이용 정지

본문 없음. `active`일 때만. `200` + Card(`frozen`), 알림 `card.status_changed`(`previous_status: active`). 오류: `409 invalid_state`, `404 card_not_found`.

### 27. POST /cards/{card_id}/unfreeze — 정지 해제

본문 없음. `frozen`일 때만. `200` + Card(`active`), 알림 `card.status_changed`. 카드 발급사가 차단한 카드(`blocked`)는 해제 불가(`409 invalid_state`). 오류: `409 invalid_state`, `404 card_not_found`.

---

## 충전

### 28. GET /cards/{card_id}/topup-quote?amount=100.00 — 수수료 미리보기

| 쿼리 | 필수 | 제약 |
|---|---|---|
| `amount` | Y | 회원이 입금할 금액(수수료 포함, USD). 양수, 정수부 최대 12자리, 소수 2자리까지 |

```json
{ "amount": "100.00", "issuer_fee": "1.00", "company_fee": "1.50", "credited_amount": "97.50", "currency": "USD" }
```

오류: `400 invalid_request`(`amount` 없음·형식), `422 amount_out_of_range`(상품 `topup_amount` 범위 밖 → `details`에 `min`·`max`, 반영액이 0 이하 → `details`에 `min`), `404 card_not_found`, `503 issuer_unavailable`.

### 29. POST /cards/{card_id}/topup-orders — 충전 주문 생성

조건: 카드 `active`, 회원에게 진행 중인 주문 없음(등록·충전 합쳐 1건).

| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `asset` | string | Y | 15번과 같음 |
| `network` | string | Y | 15번과 같음 |
| `wallet_address` | string | Y | 15번과 같음(네트워크 형식) |

```json
{ "asset": "USDT", "network": "TRON", "wallet_address": "TExampLeMemberWa11etAddress1234567" }
```

성공 `201` + Order:

```json
{
  "order_id": "ord_01jbz5e0g2j4m6p8r0t2w4y6a8",
  "type": "topup",
  "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6",
  "card_id": "card_01jbz4d9f3h5k7n9q1t3w5y7a9",
  "status": "awaiting_deposit",
  "asset": "USDT",
  "network": "TRON",
  "deposit_address": "TEST-DEPOSIT-TRON",
  "wallet_address": "TExampLeMemberWa11etAddress1234567",
  "amount_due": null,
  "min_amount": "20.00",
  "max_amount": "10000.00",
  "deposit_amount": null,
  "deposit_tx_hash": null,
  "fee_amount": null,
  "credited_amount": null,
  "fees": { "topup_fee_percent": "1.5", "topup_fee_fixed": "0.00", "issuer_fee_percent": "1.0" },
  "failure_code": null,
  "cancel_reason": null,
  "expires_at": "2026-11-06T02:50:00.000Z",
  "created_at": "2026-11-06T01:50:00.000Z",
  "updated_at": "2026-11-06T01:50:00.000Z",
  "completed_at": null
}
```

- 충전 주문은 `amount_due`가 없다(`null`). 회원은 `min_amount`~`max_amount` 안의 금액을 보낸다.
- 반영액이 0 이하면 주문 `failed`(`failure_code: amount_below_fees`) + `topup.failed`. 입금 뒤 카드가 차단·해지되어 있으면 `failed`(`card_not_active`). 정지(`frozen`) 카드는 충전된다.

오류: `422 card_not_active`, `422 unsupported_asset`, `422 wallet_address_invalid`, `409 order_in_progress`, `409 wallet_address_in_use`, `404 card_not_found`, `503 issuer_unavailable`.

### 30. GET /topup-orders — 충전 주문 목록

쿼리: `member_id`, `card_id`, `status`(`awaiting_deposit`·`deposit_confirmed`·`processing`·`completed`·`failed`·`cancelled` 외 `400`), `limit`·`cursor`·`from`·`to`. 응답: Order 배열 + 페이지.

### 31. GET /topup-orders/{order_id} — 충전 주문 조회

응답: Order. 오류: `404 order_not_found`(등록 주문 ID를 넣어도 404).

### 32. POST /topup-orders/{order_id}/cancel — 충전 주문 취소

18번과 같다(본문 없음, `awaiting_deposit`일 때만, `cancel_reason` `partner_request`/`expired`). 오류: `409 invalid_state`, `404 order_not_found`.

---

## 거래

### 33. GET /transactions — 거래 내역 검색

쿼리: `member_id`, `card_id`, `type`(쉼표로 여러 개, `payment`·`atm_withdrawal`·`reversal`·`refund`·`adjustment`·`fee` 외 `400`), `limit`·`cursor`·`from`·`to`.

- 정렬과 `from`·`to`는 `created_at`(회사에 기록된 시각) 기준. 거래가 일어난 시각은 `occurred_at`.
- 결제내역: `type=payment,reversal,refund,adjustment`. ATM 출금내역: `type=atm_withdrawal`.

응답: Transaction 배열 + 페이지.

### 34. GET /transactions/{transaction_id} — 거래 조회

```json
{
  "transaction_id": "txn_01jbz6f1h3k5n7q9s1v3x5z7b9",
  "card_id": "card_01jbz4d9f3h5k7n9q1t3w5y7a9",
  "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6",
  "type": "payment",
  "status": "approved",
  "amount": "12.30",
  "currency": "USD",
  "fee": "0.00",
  "merchant": { "name": "STARBUCKS", "category_code": "5814", "country": "KR" },
  "original_transaction_id": null,
  "occurred_at": "2026-11-06T02:00:01.000Z",
  "created_at": "2026-11-06T02:00:02.000Z"
}
```

오류: `404 transaction_not_found`.

---

## 알림 내역

### 35. GET /events — 알림 내역

쿼리: `type`(쉼표로 여러 개, 예 `card.activated,topup.completed`. 소문자·점·밑줄 형식이 아니면 `400`), `limit`·`cursor`·`from`·`to`. 응답: Event 배열 + 페이지. `ping`은 남지 않는다.

### 36. GET /events/{event_id} — 알림 조회

```json
{
  "event_id": "evt_01jbz7h3k5n7q9s1v3x5z7b9d1",
  "type": "card.activated",
  "created_at": "2026-11-06T01:45:31.000Z",
  "data": {
    "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6",
    "card": { "card_id": "card_01jbz4d9f3h5k7n9q1t3w5y7a9", "member_id": "mem_01jbz2x7d5f9h3k6n8p0r2t4v6", "product_id": "111100", "masked_number": "999999****5670", "status": "active", "created_at": "2026-11-06T01:42:10.000Z", "activated_at": "2026-11-06T01:45:31.000Z" }
  },
  "delivery": { "status": "succeeded", "attempts": 1, "last_status_code": 200, "last_attempt_at": "2026-11-06T01:45:33.000Z" }
}
```

- `delivery.status`: `pending`(대기·재전송 예정), `succeeded`, `failed`(모든 재전송 실패). `last_status_code`는 연결 실패면 `null`. 알림이 생길 때 웹훅 주소가 없었으면 `delivery: null`.

오류: `404 event_not_found`.

---

## 테스트 전용(`pk_test_` 키에서만)

운영 키로 부르면 `404 not_found`. POST에는 다른 API처럼 요청 고유키가 필요하다. 자세한 동작은 `test-environment.md`.

### 37. GET /test/card-inventory

```json
[ { "card_number": "9999990012345670", "product_id": "111100", "status": "available", "created_at": "2026-11-05T09:00:00.000Z" } ]
```

`status`: `available`(등록 가능), `registered`(등록됨). 테스트 공카드는 `999999`로 시작하는 16자리 모의 번호.

### 38. POST /test/members/{member_id}/kyc-result

| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `result` | string | Y | `approved`, `rejected` |
| `product_id` | string | N | 숫자 1~10자리, 파트너사에 허용된 상품이어야 함(아니면 `400`). 없으면 허용 상품 전부 |
| `reason` | string | N | 앞뒤 공백 제거 후 1~500자. 거절이면 `reject_reason`, `reject_reason_code`는 `simulated` |

```json
{ "result": "approved" }
```

성공 `200` + KYC 상태 목록, 상품마다 알림 `kyc.approved`/`kyc.rejected`. 오류: `409 member_verification_required`, `409 invalid_state`(허용 상품 없음), `404 member_not_found`, `400 invalid_request`.

### 39. POST /test/orders/{order_id}/deposit

| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `amount` | string | Y | 입금 자산 수량. 양수, 정수부 최대 12자리, 소수 6자리까지 |
| `wallet_address` | string | N | 1~128자. 보낸 주소. 없으면 주문의 `wallet_address`(다른 값으로 예외 입금 시험) |

```json
{ "amount": "125.50" }
```

성공 `200` + 최종 Order. 등록 주문 `deposit_confirmed` → `registered`(카드 `inactive` 생성, `card_id` 채워짐), 충전 주문 `deposit_confirmed` → `completed`. `deposit_tx_hash`는 `test_…`. 알림 `order.deposit_confirmed` + `card.registered`/`topup.completed`(또는 실패 알림).

오류: `422 deposit_not_matched`(주문 그대로, `details.reason`: `order_not_awaiting_deposit`, `order_expired`, `wallet_address_mismatch`, `amount_below_minimum`, `amount_above_maximum` 등), `404 order_not_found`.

### 40. POST /test/cards/{card_id}/transactions

| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `type` | string | Y | `payment`, `atm_withdrawal`, `reversal`, `refund`, `adjustment`, `fee` |
| `amount` | string | Y | 소수 2자리까지. `adjustment`만 음수 가능(0 불가), 그 밖은 양수 |
| `status` | string | N | `payment`·`atm_withdrawal`: `approved`(기본)·`declined`·`settled`. 그 밖의 유형은 `settled`만 |
| `fee` | string | N | 0 이상, 소수 2자리까지. `payment`·`atm_withdrawal`만 |
| `merchant.name` | string | N | 1~100자 |
| `merchant.category_code` | string | N | MCC 4자리. `atm_withdrawal`은 `6010`·`6011`만(기본 `6011`) |
| `merchant.country` | string | N | 대문자 2자리 |
| `original_transaction_id` | string | N | 1~64자. `reversal`·`refund`는 필수, `payment`·`atm_withdrawal`은 불가 |

```json
{ "type": "payment", "amount": "12.30", "merchant": { "name": "STARBUCKS", "category_code": "5814", "country": "KR" } }
```

성공 `201` + Transaction(알림 발송). 오류: `400 invalid_request`(위 규칙, 원거래 잔여 금액 초과), `404 transaction_not_found`(원거래가 이 카드의 거래가 아님), `409 invalid_state`(원거래가 승인·정산된 결제가 아님), `404 card_not_found`.

### 41. POST /test/cards/{card_id}/block

본문 없음. 카드 발급사 차단을 흉내 낸다. `200` + Card(`blocked`), 알림 `card.status_changed`. 이미 `blocked`·`closed`면 `409 invalid_state`.

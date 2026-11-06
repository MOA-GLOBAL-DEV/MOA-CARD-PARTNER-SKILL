# 테스트 환경

테스트 환경(`pk_test_` 키)에서는 입금 확인·KYC 결과·카드 등록·결제를 모의로 처리한다. 운영 키(`pk_live_`)가 아직 활성화되지 않았으면 `403 environment_unavailable`.

테스트와 운영은 같은 Base URL(`https://api.moacard.io/partner/v1`)을 쓰고, 키로 환경이 정해진다. 데이터는 섞이지 않는다.

## 1. 테스트 환경의 동작

| 항목 | 동작 |
|---|---|
| 이메일 인증번호 | 항상 `000000`. 메일은 보내지 않는다 |
| 활성화 코드 | 항상 `123456`. 메일은 보내지 않는다 |
| PIN 변경 인증번호 | 항상 `000000` |
| KYC 서류 | 형식·크기만 확인하고 파일은 보관하지 않는다 |
| KYC 신청 | 상태가 `in_review`가 된다. 결과는 테스트 API로 만든다(2절) |
| 입금 주소 | `TEST-DEPOSIT-<NETWORK>`(예: `TEST-DEPOSIT-TRON`, `TEST-DEPOSIT-BASE`). **실제로 보낼 수 없는 자리표시 값. 실제 자산을 보내지 않는다** |
| 입금 | 테스트 API로만 만든다 |
| 공카드 | 회사가 만든 모의 번호(`999999`로 시작하는 16자리). `GET /test/card-inventory`로 확인 |
| 카드 잔액·거래 | 테스트 거래 API로 만든 모의 거래만 반영 |
| 시도 제한·레이트리밋 | 운영과 같다 |
| 알림 | 운영과 같은 형식(`environment: "test"`). `card.activation_failed`는 발생하지 않는다(틀린 활성화 코드는 API 오류) |
| `deposit_tx_hash` | `test_…` 모의 값 |

화면에 `TEST-DEPOSIT-…`이 보이면 "테스트 주소 — 송금하지 마세요"처럼 표시하기를 권장한다.

## 2. 테스트 전용 API

`pk_test_` 키에서만 동작한다(운영 키는 `404 not_found`). POST에는 다른 API처럼 `Idempotency-Key`가 필요하다. 필드 제약은 `endpoints.md` 37~41번.

| API | 동작 |
|---|---|
| `GET /test/card-inventory` | 이 파트너사의 테스트 공카드: `[{ "card_number", "product_id", "status": "available" \| "registered", "created_at" }]` |
| `POST /test/members/{member_id}/kyc-result` | KYC 결과를 만든다(상품마다 알림). `200` + KYC 상태 목록 |
| `POST /test/orders/{order_id}/deposit` | 주문의 입금 주소로 입금을 만든다. 끝까지 처리하고 최종 Order를 `200`으로(알림) |
| `POST /test/cards/{card_id}/transactions` | 거래를 만든다. `201` + Transaction(알림) |
| `POST /test/cards/{card_id}/block` | 카드 발급사 차단 흉내. `200` + Card(`blocked`), `card.status_changed` |

### 2.1 KYC 결과 `POST /test/members/{member_id}/kyc-result`

```json
{ "result": "approved" }
{ "result": "rejected", "product_id": "111100", "reason": "Selfie does not match the ID photo." }
```

- 이메일 인증을 마친 회원만(`409 member_verification_required`).
- `product_id`가 없으면 허용 상품 전부. 허용되지 않은 상품이면 `400`.
- 거절이면 `reject_reason_code: "simulated"`, `reject_reason`은 `reason`(없으면 `"Rejected in the test environment."`).
- 이 파트너사가 낸 신청의 결과만 바꾼다. 다른 경로로 승인된 같은 신원이 있으면 응답에서 승인으로 보인다.

### 2.2 테스트 입금 `POST /test/orders/{order_id}/deposit`

```json
{ "amount": "125.50" }
{ "amount": "125.50", "wallet_address": "TAnotherMemberWa11etAddress1234567" }
```

- `amount`는 입금 자산 수량(소수 6자리까지). `wallet_address`가 없으면 주문의 지갑 주소(다른 값을 넣어 예외 입금 시험).
- 자산·네트워크·입금 주소는 주문 값을 쓴다.
- 등록 주문: `deposit_confirmed` → `registered`(카드 `inactive` 생성, `card_id` 채워짐, 잔액 = 입금액 − 등록 수수료). 알림 `order.deposit_confirmed` → `card.registered`.
- 충전 주문: `deposit_confirmed` → `completed`(반영액 = 입금액 − 수수료). 알림 `order.deposit_confirmed` → `topup.completed`. 반영액 0 이하면 `failed`(`amount_below_fees`) + `topup.failed`, 카드가 차단·해지면 `failed`(`card_not_active`).
- 조건이 맞지 않으면 예외 입금으로 보고 **주문은 그대로** `422 deposit_not_matched`. `error.details.reason`:

| reason | 뜻 |
|---|---|
| `order_not_awaiting_deposit` | 주문이 입금 대기가 아니다 |
| `order_expired` | 주문 유효기간(60분)이 지났다 |
| `asset_mismatch` | 자산·네트워크가 다르다(테스트 API는 주문 값을 쓰므로 실제로는 나오지 않음) |
| `deposit_address_mismatch` | 입금 주소가 다르다(위와 같음) |
| `wallet_address_mismatch` | 보낸 주소가 주문의 지갑 주소와 다르다 |
| `amount_below_minimum` | `amount_due`(충전은 `min_amount`)보다 적다 |
| `amount_above_maximum` | `max_amount`를 넘는다 |

### 2.3 테스트 거래 `POST /test/cards/{card_id}/transactions`

```json
{ "type": "payment", "amount": "12.30", "merchant": { "name": "STARBUCKS", "category_code": "5814", "country": "KR" } }
{ "type": "atm_withdrawal", "amount": "50.00", "fee": "2.50" }
{ "type": "refund", "amount": "12.30", "original_transaction_id": "txn_01jbz6f1h3k5n7q9s1v3x5z7b9" }
{ "type": "adjustment", "amount": "-1.20" }
```

- `payment`·`atm_withdrawal`: 승인·정산이면 잔액에서 `amount` + `fee`를 뺀다. 잔액이 모자라거나 카드가 `active`가 아니면 `declined`(잔액 그대로). 알림 `authorization.approved`/`authorization.declined`, `status: settled`로 만들면 `transaction.posted`. `original_transaction_id`는 넣을 수 없다.
- 가맹점을 비우면 결제는 `TEST MERCHANT`·MCC `5999`·`US`, ATM은 `TEST ATM`·MCC `6011`·`US`. ATM의 MCC는 `6010`·`6011`만.
- `reversal`·`refund`: 같은 카드의 승인·정산된 결제(ATM 포함)를 `original_transaction_id`로(필수). 다른 카드의 거래면 `404 transaction_not_found`, 거절·취소된 원거래면 `409 invalid_state`. 원거래에서 이미 취소·환불된 금액을 뺀 만큼까지 받고(넘으면 `400`) 잔액을 되돌린다(`settled`, `transaction.posted`). 가맹점은 원거래 값. 취소가 원거래 전액이 되면 원거래는 `reversed`.
- `adjustment`(부호 있는 금액, 0 불가)·`fee`(차감): `settled`, `transaction.posted`. 잔액이 모자라도 반영한다.
- `status`는 `payment`·`atm_withdrawal`만 `approved`(기본)·`declined`·`settled`, 그 밖은 `settled`만. `fee`는 `payment`·`atm_withdrawal`만.

## 3. 고정 코드

| 항목 | 값 | 쓰는 곳 |
|---|---|---|
| 이메일 인증번호 | `000000` | `POST /members/{member_id}/email-verification/confirm` |
| 활성화 코드 | `123456` | `POST /cards/{card_id}/activate` |
| PIN 변경 인증번호 | `000000` | `POST /cards/{card_id}/pin` |

※ 고정 코드도 시도 제한을 받는다. 일부러 틀린 코드를 5번 보내면 그 회원·카드는 24시간 잠긴다. 잠김 시험은 별도 회원·카드로. 인증번호 요청도 1분 1회·하루 5회 제한이 있다.

## 4. 테스트 이메일 규칙

이메일 로컬 부분(`@` 앞)에 아래 표시가 있으면 회사에 이미 있는 신원으로 흉내 낸다.

| 이메일 예 | 동작 |
|---|---|
| `user+existing@example.com` | 허용 상품의 KYC가 모두 승인된 기존 신원. 등록 응답은 다른 회원과 같다(`verification_required`, KYC `not_submitted`). 이메일 인증(`000000`)을 마치면 `linked` + KYC 모두 `approved`(재신청 없이 공카드 등록 가능) |
| `user+existing-nokyc@example.com` | KYC가 없는 기존 신원. 인증 뒤에도 KYC `not_submitted` → KYC 신청(새 이메일과 같은 흐름) |
| 그 밖의 이메일 | 새 회원 |

## 5. 전체 시나리오

금액은 예시 이용 조건(최소 활성화 100.00, 등록 수수료 20.00, 충전 수수료 발급사 1.0%·회사 1.5% + 0.00) 기준이다. 실제 값은 `GET /products`를 따른다.

| 단계 | 요청 | 확인할 결과 | 알림 |
|---|---|---|---|
| 1 | `GET /ping` | `environment: test` | — |
| 2 | `POST /members` `{ "email": "tester@example.com", "partner_member_id": "t-0001" }` | `201`, `link_status: verification_required` | — |
| 3 | `POST /members/{member_id}/email-verification` | `200`, `sent_to` | — |
| 4 | `POST /members/{member_id}/email-verification/confirm` `{ "code": "000000" }` | `200`, `link_status: linked` | — |
| 5 | `POST /members/{member_id}/kyc/documents` × 3(`id_front`, `id_back`, `selfie`) | `201`, `document_id` 3개 | — |
| 6 | `POST /members/{member_id}/kyc`(`endpoints.md` 11번 본문, 도시는 도시 API 코드) | `202`, `status: in_review` | — |
| 7 | `POST /test/members/{member_id}/kyc-result` `{ "result": "approved" }` | `200`, `status: approved` | `kyc.approved` |
| 8 | `GET /test/card-inventory` | `status: available`인 공카드 번호 | — |
| 9 | `POST /members/{member_id}/registration-orders` `{ card_number, "asset": "USDT", "network": "TRON", wallet_address }` | `201`, `amount_due: "120.00"`, `deposit_address: "TEST-DEPOSIT-TRON"` | — |
| 10 | `POST /test/orders/{order_id}/deposit` `{ "amount": "125.50" }` | `200`, `status: registered`, `credited_amount: "105.50"`, `card_id` | `order.deposit_confirmed`, `card.registered` |
| 11 | `POST /cards/{card_id}/activate` `{ "activation_code": "123456", "encrypted_pin": "<JWE>" }` | `200`, `status: active` | `card.activated` |
| 12 | `GET /cards/{card_id}/topup-quote?amount=100.00` | `credited_amount: "97.50"` | — |
| 13 | `POST /cards/{card_id}/topup-orders` `{ "asset": "USDT", "network": "TRON", wallet_address }` | `201`, `type: topup` | — |
| 14 | `POST /test/orders/{order_id}/deposit` `{ "amount": "100.00" }` | `200`, `status: completed`, `credited_amount: "97.50"` | `order.deposit_confirmed`, `topup.completed` |
| 15 | `GET /cards/{card_id}/balance` | `available_balance: "203.00"` | — |
| 16 | `POST /test/cards/{card_id}/transactions` `{ "type": "payment", "amount": "12.30" }` | `201`, `status: approved` | `authorization.approved` |
| 17 | `GET /cards/{card_id}/balance` | `available_balance: "190.70"` | — |
| 18 | `GET /events?type=card.activated,topup.completed` | 알림과 `delivery.status` | — |
| 19 | `GET /transactions?card_id={card_id}&type=payment,reversal,refund,adjustment` | 16의 결제 | — |

11단계의 `<JWE>`는 `GET /pin-encryption-key`로 받은 공개키로 만든다. 테스트에서는 `node scripts/jwe_pin.mjs --pin 123456 --fetch`(또는 `--key-file`)로 만들 수 있지만, **운영에서는 반드시 앱(회원 기기)에서 암호화**한다.

TRON 지갑 주소 예(형식 확인용): `TExampLeMemberWa11etAddress1234567`(`T` + base58 33자). EVM 예: `0x` + 16진수 40자리.

### 추가로 확인하면 좋은 경우

- 이메일 인증 전에 KYC 신청 → `409 member_verification_required`
- 같은 요청 고유키로 회원 등록을 다시 보냄 → 같은 상태 코드, `Idempotent-Replayed: true`, `data: null`
- 같은 서명(같은 시각)으로 요청을 다시 보냄 → `401 authentication_failed`
- 주문의 지갑 주소가 아닌 주소로 테스트 입금 → `422 deposit_not_matched`(`wallet_address_mismatch`), 주문은 그대로
- 등록 주문 취소 → `200`, `cancel_reason: partner_request`
- `POST /cards/{card_id}/freeze` → `card.status_changed`(`previous_status: active`), 해제 후 다시 `active`
- `POST /test/cards/{card_id}/block` → `blocked`, 이후 `unfreeze`는 `409 invalid_state`
- `+existing` 이메일 → 인증 뒤 KYC 없이 공카드 등록 가능
- 결제 뒤 `refund`(원거래 지정) → `transaction.posted`, 잔액 복구
- 웹훅 수신부를 일부러 5xx로 답하게 해 재전송(1분 뒤)과 `event_id` 중복 제거 확인

## 6. 운영 전환 체크리스트

- 운영 키(`pk_live_`/`sk_live_`), 운영 허용 IP, 운영 웹훅 주소, 운영 웹훅 서명 키를 따로 받는다.
- 웹훅 검증 키를 환경별로 고른다(`environment` 필드 기준).
- 테스트 전용 API(`/test/…`) 호출과 고정 코드(`000000`, `123456`) 가정을 운영 경로에서 뺀다.
- 입금 안내 화면이 실제 `deposit_address`를 보여 주는지, 예외 입금 안내(본인 지갑에서 송금)가 있는지 확인한다.
- PIN 암호화가 앱에서만 일어나는지, 서버 로그에 비밀키·PIN·카드 상세정보·`encrypted` 값이 남지 않는지 확인한다.

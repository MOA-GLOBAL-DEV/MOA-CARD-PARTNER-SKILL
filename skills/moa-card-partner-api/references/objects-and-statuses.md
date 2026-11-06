# 객체와 상태값

금액은 모두 문자열(USD 소수 2자리, `deposit_amount`만 소수 6자리), 시각은 ISO 8601 UTC 문자열. 값이 없으면 필드를 빼지 않고 `null`. 응답에 필드가 추가될 수 있으므로 모르는 필드는 무시한다.

## Member

| 필드 | 타입 | 설명 |
|---|---|---|
| `member_id` | string | `mem_…` |
| `partner_member_id` | string | 파트너사 회원 ID(대소문자 구분) |
| `email` | string | 회원 이메일(소문자) |
| `link_status` | string | `verification_required`(이메일 인증 전), `linked`(인증 완료) |
| `kyc` | array | 파트너사에 허용된 카드 상품마다 KYC 항목 하나(아래) |
| `created_at` | string | 등록 시각 |

## KYC 항목

| 필드 | 타입 | 설명 |
|---|---|---|
| `product_id` | string | 카드 상품 ID |
| `status` | string | 아래 상태값 |
| `reject_reason_code` | string \| null | 거절 사유 코드(거절일 때. 테스트 환경 결과는 `simulated`) |
| `reject_reason` | string \| null | 카드 발급사가 준 거절 사유(거절일 때) |
| `updated_at` | string \| null | 마지막 상태 변경 시각. 기록이 없으면 `null` |

| status | 뜻 | 다음 행동 |
|---|---|---|
| `not_submitted` | 미제출 | KYC 신청. 이메일 인증 전 회원은 모두 이 값으로 보인다 |
| `pending` | 대기 | 결과를 기다린다 |
| `in_review` | 심사 중 | 결과를 기다린다 |
| `approved` | 승인 | 그 상품의 공카드를 등록할 수 있다 |
| `rejected` | 거절 | 사유를 안내하고 보완해 재신청 |

KYC 공유 규칙(회원 = 이메일 단위):
- 이메일 인증을 마친 회원에게는 같은 이메일로 이미 **승인된** KYC가 상품별로 그대로 보인다(회사의 다른 서비스·다른 파트너사에서 승인된 것 포함). 다시 신청할 필요가 없다.
- 다른 곳에서 심사 중이거나 거절된 상태는 보이지 않는다. 이 파트너사가 낸 신청의 상태만 보인다.
- 심사 기준과 결과는 카드 발급사가 정한다. `reject_reason`은 발급사 문구이므로 화면에는 파트너사 안내 문구와 함께 쓰기를 권장한다.

## Product(`GET /products`)

| 필드 | 타입 | 설명 |
|---|---|---|
| `product_id` | string | 카드 상품 ID |
| `name` · `brand` | string | 상품 이름, 카드 브랜드(대문자) |
| `activation_amount.min` · `max` | string | 공카드 등록 첫 입금의 범위(등록 수수료 제외). 최소 활성화 금액이 없으면 `min`은 `"0.00"`(이때 등록 주문의 `amount_due`는 등록 수수료와 같다). 최대값이 없으면 `max`는 `topup_amount.max`와 같다 |
| `topup_amount.min` · `max` | string | 충전 1회 입금액 범위(수수료 포함 입금액 기준) |
| `supported_nationalities` | array | 이용 가능한 국적 코드. 정보가 없으면 `[]` |
| `supported_regions` | array | 이용 가능한 지역 코드. 정보가 없으면 `[]` |
| `fees.registration.fixed` | string | 등록 수수료(USD, 계약) |
| `fees.topup.issuer_percent` | string | 카드 발급사 충전 수수료율(%) |
| `fees.topup.percent` · `fixed` | string | 회사 충전 수수료율(%)·고정액(USD, 계약) |
| `fees.payment` | object \| null | 결제 수수료 `{ percent, fixed }`. 설정이 없으면 `null` |
| `fees.atm` | object \| null | ATM 출금 수수료 `{ percent, fixed }`. 설정이 없으면 `null` |

## Card

| 필드 | 타입 | 설명 |
|---|---|---|
| `card_id` | string | `card_…` |
| `member_id` | string | 회원 ID |
| `product_id` | string | 카드 상품 ID |
| `masked_number` | string | 앞 6자리 + `****` + 뒤 4자리(카드 번호 길이와 상관없이 별 4개) |
| `status` | string | 아래 상태값 |
| `created_at` | string | 등록 시각 |
| `activated_at` | string \| null | 활성화 시각(활성화 전 `null`) |

잔액은 Card에 없다. `GET /cards/{card_id}/balance` → `{ card_id, available_balance, currency: "USD", updated_at }`.

| status | 뜻 | 설명 |
|---|---|---|
| `pending` | 대기 | 카드 발급사 처리 대기 |
| `inactive` | 미활성 | 등록 완료, 활성화 전 |
| `active` | 정상 | 결제·충전 가능 |
| `frozen` | 정지 | 회원 요청으로 정지. 결제는 막히고, 이미 만든 충전 주문의 입금은 반영된다 |
| `blocked` | 차단 | 카드 발급사가 차단. 파트너 API로 해제할 수 없다 |
| `closed` | 해지 | 해지된 카드. 해지·잔액 반환 절차는 양사가 별도로 정한다 |

상태별로 할 수 있는 요청(그 밖의 상태면 `409 invalid_state`, 충전 주문만 `422 card_not_active`):

| 요청 | 가능한 카드 상태 |
|---|---|
| 활성화 | `inactive` |
| 이용 정지 | `active` |
| 정지 해제 | `frozen` |
| 카드 상세정보, PIN 변경 인증 요청, PIN 변경 | `active`, `frozen` |
| 충전 주문 생성 | `active` |
| [테스트] 차단 | `pending`, `inactive`, `active`, `frozen` |

## Order(등록·충전 공통)

| 필드 | 타입 | 설명 |
|---|---|---|
| `order_id` | string | `ord_…` |
| `type` | string | `registration`(등록 주문), `topup`(충전 주문) |
| `member_id` | string | 회원 ID |
| `card_id` | string \| null | 충전 주문은 대상 카드. 등록 주문은 등록 완료 뒤 채워진다 |
| `status` | string | 아래 상태값 |
| `asset` · `network` | string | 입금 자산·네트워크(대문자) |
| `deposit_address` | string | 입금 주소(테스트 환경 `TEST-DEPOSIT-<NETWORK>`) |
| `wallet_address` | string | 회원 지갑 주소(이 주소에서 보낸 입금만 처리) |
| `amount_due` | string \| null | 입금할 금액(등록 주문만) |
| `min_amount` · `max_amount` | string \| null | 입금액 범위 |
| `deposit_amount` | string \| null | 확인된 입금 자산 수량(소수 6자리) |
| `deposit_tx_hash` | string \| null | 입금 트랜잭션 해시(테스트 환경은 `test_…`) |
| `fee_amount` | string \| null | 처리 뒤 확정된 수수료 합계(등록 수수료 또는 충전 수수료) |
| `credited_amount` | string \| null | 카드에 반영된 금액 |
| `fees` | object | 주문 생성 시점 요율. 등록 `{ registration_fee }`, 충전 `{ topup_fee_percent, topup_fee_fixed, issuer_fee_percent }` |
| `failure_code` | string \| null | 실패 사유 코드(`status: failed`일 때) |
| `cancel_reason` | string \| null | `partner_request`(취소 요청), `expired`(유효기간 경과) |
| `expires_at` | string | 유효기간(생성 후 60분) |
| `created_at` · `updated_at` | string | 생성·변경 시각 |
| `completed_at` | string \| null | 등록 완료·충전 완료·실패 시각 |

| status | 뜻 | 주문 종류 | 설명 |
|---|---|---|---|
| `awaiting_deposit` | 입금 대기 | 등록·충전 | 회원의 입금을 기다린다. 취소할 수 있다 |
| `deposit_confirmed` | 입금 확인 | 등록·충전 | 입금을 확인하고 처리 중 |
| `processing` | 처리 중 | 충전 | 카드 발급사 처리 중 |
| `registered` | 등록 완료 | 등록 | 카드가 등록됨(`card_id` 채워짐, 카드 `inactive`) |
| `completed` | 완료 | 충전 | 카드에 반영됨 |
| `failed` | 실패 | 등록·충전 | `failure_code` 참고 |
| `cancelled` | 취소 | 등록·충전 | `cancel_reason` 참고 |

진행 중 주문 = `awaiting_deposit`·`deposit_confirmed`·`processing`. 회원별로 등록·충전 합쳐 **1건**만 가능하다.

| failure_code | 주문 종류 | 뜻 |
|---|---|---|
| `card_unavailable` | 등록 | 공카드를 더 이상 쓸 수 없다 |
| `card_already_registered` | 등록 | 이미 등록된 카드다 |
| `amount_below_fees` | 충전 | 입금액이 수수료보다 작다 |
| `card_not_active` | 충전 | 카드가 차단·해지되어 반영할 수 없다 |

## Transaction

| 필드 | 타입 | 설명 |
|---|---|---|
| `transaction_id` | string | `txn_…` |
| `card_id` · `member_id` | string | 카드·회원 ID |
| `type` · `status` | string | 아래 값 |
| `amount` | string | 거래 금액. 정산 조정(`adjustment`)은 부호가 있다(음수 = 차감) |
| `currency` | string | 통화 |
| `fee` | string | 거래 수수료(ATM 출금 수수료 등) |
| `merchant.name` · `category_code` · `country` | string \| null | 가맹점 이름, 업종 코드(MCC 4자리), 국가 코드 |
| `original_transaction_id` | string \| null | 원거래 ID(취소·환불·정산 조정일 때) |
| `occurred_at` | string | 거래가 일어난 시각 |
| `created_at` | string | 회사에 기록된 시각(목록 정렬·`from`/`to` 기준) |

| type | 뜻 | 설명 |
|---|---|---|
| `payment` | 결제 | 카드 결제 |
| `atm_withdrawal` | ATM 출금 | MCC 6010·6011. 카드 상품이 지원할 때 |
| `reversal` | 승인 취소 | 원거래(결제·ATM)의 승인 취소 |
| `refund` | 환불 | 원거래의 환불 |
| `adjustment` | 정산 조정 | 정산 차이 조정. 금액에 부호 |
| `fee` | 수수료 | 카드에서 차감된 수수료 |

| status | 뜻 | 설명 |
|---|---|---|
| `approved` | 승인 | 승인되어 잔액에서 빠졌다(정산 전) |
| `declined` | 거절 | 거절(잔액 변화 없음) |
| `settled` | 정산 | 정산 완료. 취소·환불·조정·수수료는 정산 상태로 기록된다 |
| `reversed` | 취소됨 | 원거래 전액이 승인 취소되었다 |

원거래 연결: `reversal`·`refund`·`adjustment`는 `original_transaction_id`로 원거래와 연결된다. 원거래 화면에서 연결 거래를 보이려면 같은 카드의 거래 목록에서 `original_transaction_id`가 원거래 ID인 항목을 찾는다. 원거래 전액이 승인 취소되면 원거래 `status`가 `reversed`로 바뀐다.

## Event(`GET /events`)

| 필드 | 설명 |
|---|---|
| `event_id` · `type` · `created_at` | 알림 ID(`evt_…`)·종류·생성 시각 |
| `data` | 웹훅 본문의 `data`와 같은 내용(`webhooks.md`) |
| `delivery.status` | `pending`(전송 대기·재전송 예정), `succeeded`(수신 성공), `failed`(모든 재전송 실패) |
| `delivery.attempts` | 전송 시도 횟수 |
| `delivery.last_status_code` | 마지막 응답 상태 코드. 연결 실패면 `null` |
| `delivery.last_attempt_at` | 마지막 시도 시각 |
| `delivery: null` | 알림이 생길 때 웹훅 주소가 등록되어 있지 않았다 |

## 상태값 한눈에

| 대상 | 필드 | 값 |
|---|---|---|
| 회원 | `link_status` | `verification_required`, `linked` |
| KYC | `status` | `not_submitted`, `pending`, `in_review`, `approved`, `rejected` |
| 카드 | `status` | `pending`, `inactive`, `active`, `frozen`, `blocked`, `closed` |
| 등록 주문 | `status` | `awaiting_deposit`, `deposit_confirmed`, `registered`, `failed`, `cancelled` |
| 충전 주문 | `status` | `awaiting_deposit`, `deposit_confirmed`, `processing`, `completed`, `failed`, `cancelled` |
| 주문 | `failure_code` | 등록 `card_unavailable`, `card_already_registered` / 충전 `amount_below_fees`, `card_not_active` |
| 주문 | `cancel_reason` | `partner_request`, `expired` |
| 거래 | `type` | `payment`, `atm_withdrawal`, `reversal`, `refund`, `adjustment`, `fee` |
| 거래 | `status` | `approved`, `declined`, `settled`, `reversed` |
| 알림 전송 | `delivery.status` | `pending`, `succeeded`, `failed` |
| KYC 서류 | `type` | `id_front`, `id_back`, `selfie` |
| 신분증 | `id_document.type` | `passport`, `national_id`, `driving_license` |
| 테스트 공카드 | `status` | `available`, `registered` |

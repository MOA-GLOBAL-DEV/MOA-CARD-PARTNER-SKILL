# 오류 코드

오류 응답 형식은 `conventions.md` 5절. **분기는 `error.code`로만** 한다(`message`는 바뀔 수 있다). 회원 화면에는 응답의 `user_message`(`ko`·`en`)를 쓴다. 아래 "회원 안내 문구"는 기본값이며 실제 응답과 다를 수 있다(예: `502 issuer_error`는 발급사 사유에 맞는 문구).

## 1. 코드표

| HTTP | code | retryable | 의미 | 회원 안내 문구(ko) |
|---|---|---|---|---|
| 400 | `invalid_request` | false | 요청 형식 오류(`details`에 필드별 사유). 본문 크기 초과, 압축 본문, JSON 아님, POST의 요청 고유키 누락·255자 초과, 잘못된 쿼리 포함 | 요청 형식이 올바르지 않습니다. |
| 401 | `authentication_failed` | false | 키·서명·시각 오류, 같은 서명 재전송. 인증하지 않은 요청은 없는 경로도 401 | 인증에 실패했습니다. |
| 403 | `ip_not_allowed` | false | 등록하지 않은 IP에서 호출 | 허용되지 않은 접속 위치입니다. |
| 403 | `partner_suspended` | false | 이용 정지된 파트너사 | 서비스 이용이 일시 중지되었습니다. 고객센터에 문의해 주세요. |
| 403 | `environment_unavailable` | false | 아직 열리지 않은 환경(운영) | 아직 이용할 수 없는 환경입니다. |
| 404 | `not_found` | false | 경로·대상 없음(운영 키로 테스트 API 호출, 없는 국가 코드 포함) | 요청한 정보를 찾을 수 없습니다. |
| 404 | `member_not_found` | false | 회원 없음(다른 파트너사·환경의 회원 포함) | 회원 정보를 찾을 수 없습니다. |
| 404 | `card_not_found` | false | 카드 없음 | 카드 정보를 찾을 수 없습니다. |
| 404 | `order_not_found` | false | 주문 없음(등록·충전 경로가 다른 주문 포함) | 주문 정보를 찾을 수 없습니다. |
| 404 | `transaction_not_found` | false | 거래 없음(테스트 거래의 원거래가 이 카드 거래가 아닌 경우 포함) | 거래 내역을 찾을 수 없습니다. |
| 404 | `event_not_found` | false | 알림 없음 | 알림 내역을 찾을 수 없습니다. |
| 409 | `member_id_conflict` | false | 같은 `partner_member_id`에 다른 이메일이 연결됨(`related.member_id`=기존 회원) | 이미 다른 이메일로 등록된 회원입니다. |
| 409 | `email_already_registered` | false | 같은 이메일이 다른 `partner_member_id`로 등록됨(`related.member_id`=기존 회원) | 이미 등록된 이메일입니다. |
| 409 | `member_verification_required` | false | 이메일 인증 전(KYC 신청·공카드 등록·테스트 KYC 결과) | 이메일 인증을 먼저 완료해 주세요. |
| 409 | `kyc_already_approved` | false | 허용 상품의 KYC가 모두 승인됨(공유된 승인 포함) | 이미 본인 인증(KYC)이 승인되었습니다. |
| 409 | `kyc_in_review` | false | 대기·심사 중인 KYC가 있음 | 본인 인증(KYC)을 심사 중입니다. 결과를 기다려 주세요. |
| 409 | `card_already_registered` | false | 이미 등록된 카드, 또는 같은 카드의 등록 주문이 다른 회원에게서 진행 중 | 이미 등록된 카드입니다. |
| 409 | `order_in_progress` | false | 회원에게 진행 중인 주문(등록·충전 합쳐 1건)이 있음 | 진행 중인 주문이 있습니다. 완료 또는 취소 후 다시 시도해 주세요. |
| 409 | `wallet_address_in_use` | false | 같은 자산·네트워크·입금 주소로 같은 지갑에서 입금을 기다리는 다른 주문이 있음 | 이 지갑 주소로 입금을 기다리는 다른 주문이 있습니다. 다른 지갑 주소를 쓰거나 잠시 후 다시 시도해 주세요. |
| 409 | `invalid_state` | false | 현재 상태에서 할 수 없는 요청(카드·주문 상태, 이미 `linked`인 회원의 인증, 허용 상품 없음 등) | 현재 상태에서는 요청을 처리할 수 없습니다. |
| 409 | `idempotency_key_reused` | false | 같은 요청 고유키에 다른 경로·본문 | 요청을 처리할 수 없습니다. 다시 시도해 주세요. |
| 409 | `request_in_progress` | **true** | 같은 요청 고유키의 요청이 처리 중(`Retry-After: 1`), 같은 회원 동시 등록 | 요청을 처리하고 있습니다. 잠시 후 다시 확인해 주세요. |
| 422 | `kyc_not_approved` | false | 그 카드 상품의 KYC가 승인되지 않음 | KYC 승인 후 카드를 등록할 수 있습니다. |
| 422 | `card_not_assigned` | false | 파트너사에 공급되지 않은 공카드이거나 허용되지 않은 상품 | 등록할 수 없는 카드 번호입니다. |
| 422 | `card_not_active` | false | 활성 상태가 아닌 카드(충전 주문) | 활성화된 카드에서만 이용할 수 있습니다. |
| 422 | `unsupported_asset` | false | `GET /topup/options`에 없는 자산·네트워크 | 지원하지 않는 입금 자산 또는 네트워크입니다. |
| 422 | `wallet_address_invalid` | false | 지갑 주소가 네트워크 형식에 맞지 않음 | 지갑 주소가 올바르지 않습니다. 입금 네트워크와 같은 체인의 주소인지 확인해 주세요. |
| 422 | `amount_out_of_range` | false | 금액 범위 밖(`details.min`·`details.max`) 또는 수수료를 넘지 못함(`details.min`) | 이용 가능한 금액 범위를 벗어났습니다. |
| 422 | `deposit_not_matched` | false | [테스트] 테스트 입금이 주문 조건과 맞지 않음(`details.reason`). 주문은 그대로 | 입금 정보가 주문과 맞지 않아 자동으로 처리되지 않았습니다. 고객센터에 문의해 주세요. |
| 422 | `document_invalid` | false | 서류 형식·크기 오류(`details`에 필드) | 서류 파일을 확인해 주세요. JPG, PNG, PDF 형식의 2MB 이하 파일만 등록할 수 있습니다. |
| 422 | `document_not_found` | false | KYC 신청 본문의 서류 ID가 없거나 다른 회원·다른 종류의 서류(`details`에 `documents.<type>`) | 등록된 서류를 찾을 수 없습니다. 서류를 다시 등록해 주세요. |
| 422 | `id_document_already_used` | false | 같은 신분증(종류·번호)이 다른 이메일의 승인·심사 중 KYC에 쓰임 | 이미 다른 계정에서 사용된 신분증입니다. 다른 종류의 신분증으로 신청해 주세요. |
| 422 | `invalid_verification_code` | false | 인증번호가 틀림(남은 횟수 안) | 인증번호가 올바르지 않습니다. |
| 422 | `verification_code_expired` | false | 인증번호를 요청하지 않았거나 10분 지남 | 인증번호가 만료되었습니다. 인증번호를 다시 요청해 주세요. |
| 422 | `verification_locked` | false | 인증번호·활성화 코드를 24시간 안에 5번 틀림 | 인증번호를 여러 번 잘못 입력했습니다. 인증번호를 다시 요청해 주세요. |
| 422 | `invalid_activation_code` | false | 활성화 코드가 틀림(남은 횟수 안) | 활성화 코드가 올바르지 않습니다. |
| 422 | `pin_invalid` | false | 암호화한 PIN(JWE)의 형식·알고리즘·`kid`·복호화·PIN 형식 중 하나가 틀림 | PIN을 확인해 주세요. |
| 422 | `public_key_invalid` | false | 기기 공개키가 SPKI PEM RSA 2048비트 이상이 아님 | 보안 키가 올바르지 않습니다. 앱을 다시 실행해 주세요. |
| 429 | `rate_limited` | **true** | 요청 한도 초과(`Retry-After`). 인증번호 재요청 제한·하루 한도, 카드 상세정보 시간당 한도 포함 | 요청이 많습니다. 잠시 후 다시 시도해 주세요. |
| 500 | `internal_error` | **true** | 회사 서버 일시 오류 | 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요. |
| 502 | `issuer_error` | false | 카드 발급사가 요청을 거절함 | 카드 발급사에서 요청을 처리하지 못했습니다. |
| 503 | `issuer_unavailable` | **true** | 카드 발급사 또는 회사 시스템 일시 장애 | 카드 발급사 서비스가 일시적으로 원활하지 않습니다. 잠시 후 다시 시도해 주세요. |

- `429`는 네트워크 앞단(IP별 한도)에서 JSON 본문 없이 올 수도 있다. 본문이 없어도 재시도 대상으로 처리한다.

## 2. 처리 권장

| 상황 | 권장 처리 |
|---|---|
| 응답을 받지 못함(타임아웃·연결 끊김) | POST는 같은 요청 고유키로, GET은 그대로 다시. 모두 새 시각으로 서명 |
| `retryable: true`(`409 request_in_progress`, `429`, `500`, `503`) | `Retry-After`가 있으면 그만큼, 없으면 지수 백오프(1·2·4초…). POST는 같은 고유키 + 새 시각·서명. 하루 한도처럼 `Retry-After`가 길면 회원에게 안내하고 자동 재시도하지 않는다 |
| `401 authentication_failed` | 재시도하지 않는다. `auth-and-signing.md` 10절 점검표 |
| `403` | 재시도하지 않는다. IP 등록·환경·계약 상태를 확인 |
| `400 invalid_request` | 재시도하지 않는다. `details` 키로 틀린 입력을 찾아 고친 뒤 **새 고유키**로 |
| `409`·`422` 업무 오류 | `user_message`를 보여 주고, 상태를 조회해 다음 행동을 정한다(아래 3절) |
| `502 issuer_error` | 같은 요청을 반복하지 않는다. `user_message` 안내, 계속되면 `X-Request-Id`와 함께 회사 문의 |

## 3. 코드별 다음 행동

| code | 다음 행동 |
|---|---|
| `member_id_conflict` / `email_already_registered` | `related.member_id`로 기존 회원을 조회해 파트너사 매핑을 점검. 이메일 변경은 API로 제공하지 않으므로 회사에 문의 |
| `member_verification_required` | 이메일 인증(`email-verification` → `confirm`)부터 |
| `invalid_state`(인증 API) | 이미 `linked`. 회원을 조회해 다음 단계(KYC 확인)로 |
| `kyc_already_approved` | KYC 생략, 공카드 등록으로 |
| `kyc_in_review` | `kyc.approved`/`kyc.rejected` 웹훅을 기다리거나 `GET …/kyc` |
| `document_invalid` | `details` 필드 확인: 형식(`content_type`)·base64·크기(2MB)·형식과 내용 일치 |
| `document_not_found`(422) | 이 회원이 등록한 해당 종류의 서류 ID인지 확인, 필요하면 다시 등록 |
| `id_document_already_used` | 다른 종류의 신분증(여권·정부 발급 신분증·운전면허증)으로 재신청 안내 |
| `kyc_not_approved` | 그 카드 상품의 KYC 상태 확인 후 신청·대기 |
| `card_not_assigned` | 공카드 번호 오타, 파트너사에 공급된 카드인지, 허용 상품인지 확인 |
| `card_already_registered` | 이미 등록된 카드. 회원의 카드 목록(`GET /members/{id}/cards`) 확인 |
| `order_in_progress` | 진행 중 주문 조회(`GET /registration-orders?member_id=…&status=awaiting_deposit`, 충전도 같음) → 입금 대기면 취소 후 다시 |
| `wallet_address_in_use` | 다른 지갑 주소를 쓰거나 기존 주문이 끝난 뒤(입금·취소·만료) 다시 |
| `unsupported_asset` / `wallet_address_invalid` | `GET /topup/options` 다시 조회, 주소가 네트워크 형식(EVM `0x`+40hex, TRON `T`+33, SOL base58 32~44)인지 |
| `amount_out_of_range` | `details.min`·`max` 범위 안내 |
| `card_not_active` | 카드 상태 확인(`inactive`면 활성화, `frozen`이면 해제, `blocked`·`closed`면 충전 불가) |
| `pin_invalid` | 앱의 JWE 생성 확인: `{"pin":"NNNNNN"}`, `RSA-OAEP-256`+`A256GCM`, `kid`=최신 `key_id`, `zip` 없음. `GET /pin-encryption-key` 다시 받기 |
| `invalid_activation_code` / `invalid_verification_code` | 다시 입력 안내(남은 횟수 주의) |
| `verification_code_expired` | 인증번호 다시 요청 |
| `verification_locked` | 24시간 뒤 다시. 그동안 재요청은 `429` |
| `public_key_invalid` | 앱이 SPKI PEM(`BEGIN PUBLIC KEY`) RSA 2048+로 보내는지(iOS는 PKCS#1에 SPKI 헤더 추가) |
| `idempotency_key_reused` | 코드 버그 신호. 의도마다 새 키를 만들고, 재시도에만 같은 키를 쓰는지 점검 |
| `request_in_progress` | 1초 뒤 같은 키로 다시(처음 결과를 받게 됨) |
| `deposit_not_matched`(테스트) | `details.reason`에 맞게 테스트 입금 값을 고친다(`test-environment.md`) |

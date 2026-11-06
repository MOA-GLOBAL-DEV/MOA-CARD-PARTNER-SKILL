---
name: moa-card-partner-api
description: "MOA 카드 파트너 API(api.moacard.io/partner/v1) 연동·디버깅용 스킬. 파트너사 서버 코드에서 회원 등록, 이메일 인증, KYC 서류·신청, 실물 공카드 등록 주문·입금·활성화(JWE PIN), 카드 조회·정지·상세정보·PIN 변경, 충전 견적·주문, 거래 내역, 웹훅 수신·서명 검증, 요청 서명(X-Moa-Signature, HMAC-SHA256, Idempotency-Key), 오류 코드 처리, 테스트 환경(pk_test_) 시나리오를 구현하거나 401·409·422 같은 오류를 고칠 때 사용한다. Use when integrating or debugging the MOA card Partner API: request signing, idempotency, members, email verification, KYC, physical card registration and activation, card management, top-ups, transactions, webhooks."
---

# MOA 카드 파트너 API 연동

파트너사 개발자가 MOA 카드 파트너 API를 **파트너사 서버**에 붙이도록 돕는다. 상세 명세는 `references/`에, 실행 가능한 도구는 `scripts/`에 있다. 필요한 파일만 그때그때 읽는다.

## 이용 가능 환경

- Base URL: `https://api.moacard.io/partner/v1` (테스트·운영 같은 주소, 환경은 API Key로 결정)
- 테스트 환경(`pk_test_…` / `sk_test_…`)은 입금·KYC 결과·카드 등록·결제를 모의로 처리하고 테스트 전용 API를 쓴다.
- 운영 환경(`pk_live_…`)은 실제 카드 발급사와 연결된다. 운영 키가 아직 활성화되지 않았으면 `403 environment_unavailable`(활성화 시점은 회사 담당자에게 확인, 추측해 안내하지 않는다).
- 키·허용 IP·웹훅 주소는 회사 담당자에게 환경별로 요청한다(비밀키는 발급 때 한 번만 전달).

## 반드시 지킬 규칙

1. **서버에서만 호출한다.** 비밀키(`sk_…`)는 서버 비밀 저장소(환경변수·시크릿 매니저)에만 둔다. 앱·웹 번들, 저장소(git), 로그, 오류 메시지, 클라이언트 응답에 넣지 않는다. 앱 코드에서 MOA를 직접 부르는 구현을 만들지 않는다.
2. **모든 요청에 서명한다.** 원문 5줄 = `timestamp \n METHOD \n /partner/v1부터의 path_with_query \n Idempotency-Key(없으면 빈 줄) \n sha256(본문 바이트)`, `X-Moa-Signature: v1=hex(HMAC-SHA256(sk_… 문자열, 원문))`. 서명한 바이트를 그대로 보낸다(다시 직렬화 금지).
3. **재시도·폴링마다 새 시각으로 다시 서명한다.** 같은 서명은 600초 동안 한 번만 통과한다(재전송은 `401`). 같은 초에 똑같은 요청이면 다음 초로.
4. **모든 POST에 `Idempotency-Key`**(본문 없는 POST 포함, 1~255자, UUID 권장). 회원의 한 번의 의도마다 새 키, 응답을 못 받은 재시도에는 **같은 키**. 400으로 입력을 고쳐 보낼 때는 새 키.
5. **웹훅은 받은 원문 바이트로 서명을 검증**(`t=…,v1=…`, `HMAC(whsec_…, t + "." + body)`, 300초 허용, 상수 시간 비교)하고, **`event_id`로 중복을 거른 뒤** 10초 안에 2xx로 답하고 비동기로 처리한다. 순서를 믿지 말고 받은 뒤 최신 상태를 조회한다.
6. **PIN과 카드 상세정보(PAN·CVV)는 JWE로만 오가고 파트너사 서버는 평문을 보지 않는다.** PIN은 앱이 `GET /pin-encryption-key` 공개키로 `{"pin":"NNNNNN"}`을 JWE(`RSA-OAEP-256`+`A256GCM`, `kid`)로 암호화한다. 상세정보는 앱이 만든 RSA 2048+ 공개키로 받은 `encrypted`를 앱이 복호화한다. 서버는 PIN·`encrypted_pin`·`encrypted`를 저장·로그하지 않는다.
7. **금액은 10진 문자열**이다(`"100.00"`, 입금 수량만 소수 6자리). float로 계산하지 말고 decimal/BigDecimal/정수 센트를 쓴다. 반올림은 센트 단위 half-up.
8. **시각은 ISO 8601 UTC 문자열**, `X-Moa-Timestamp`만 Unix **초**. 서버 시계를 NTP로 맞춘다.
9. **분기는 `error.code`로만**, 회원 화면에는 `user_message`를 쓴다. `retryable: true`만 자동 재시도한다.
10. **테스트 환경에서는 테스트 전용 API와 고정 코드**(이메일·PIN 변경 `000000`, 활성화 `123456`, `TEST-DEPOSIT-…` 주소, `+existing` 이메일)로 흐름을 끝까지 검증한다. 테스트 입금 주소로 실제 자산을 보내라고 안내하지 않는다. 운영 경로에는 `/test/…` 호출을 남기지 않는다.
11. 문서에 없는 필드·엔드포인트·동작을 지어내지 않는다. 모르면 `references/`를 다시 읽고, 그래도 없으면 회사 담당자에게 확인하라고 안내한다.

## 작업 절차

1. **상황 파악**: 파트너사 서버 언어·프레임워크, HTTP 클라이언트, 비밀 저장 방식, 앱(모바일/웹) 구조, 이미 있는 연동 코드를 확인한다.
2. **서명부터**: 서명 함수를 만들고 고정값으로 확인한다(`references/auth-and-signing.md` 3절, `scripts/sign_request.* --self-test`). POST 고정값 결과 `v1=25a4a6baf576fb3ded36b501a6139b36941a191eabc6895fa244d58230042823`.
3. **연결 확인**: `GET /ping` → 200, `environment: "test"`. 401·403이면 `auth-and-signing.md` 10절 점검표.
4. **공통 클라이언트**: 서명·멱등 키·재시도·`X-Request-Id` 로깅을 한곳에 모은다(`scripts/partner_client.mjs`를 참고해 파트너사 언어로 옮긴다).
5. **기능 구현**: 요청한 기능에 맞는 레퍼런스를 읽는다(아래 표). 필드 제약은 `endpoints.md`를 그대로 따른다.
6. **웹훅 수신부**: `references/webhooks.md`. 회사에 `ping` 테스트 전송을 요청해 확인.
7. **시나리오 검증**: `references/test-environment.md` 5절의 19단계와 추가 확인 항목을 수행한다.
8. **검토**: 아래 "코드 검토 체크리스트"로 생성한 코드를 점검한다.

## 기능 → 읽을 파일

| 하려는 일 | 파일 |
|---|---|
| 서명·헤더·멱등·허용 IP·레이트리밋, 401 해결 | `references/auth-and-signing.md` |
| 응답 봉투·페이지(cursor)·오류 형식·본문 크기 | `references/conventions.md` |
| 특정 API의 필드·제약·응답·오류 | `references/endpoints.md` (41개 전체) |
| Member·Card·Order·Transaction 필드와 상태값 | `references/objects-and-statuses.md` |
| 온보딩·공카드 등록·활성화·상세정보·PIN 변경·충전·거래 흐름 | `references/flows.md` |
| 웹훅 형식·서명 검증·재전송·이벤트 payload | `references/webhooks.md` |
| 오류 코드별 의미·재시도·다음 행동 | `references/errors.md` |
| 테스트 전용 API·고정 코드·시나리오·운영 전환 | `references/test-environment.md` |

## 핵심 흐름 요약

- **온보딩**: `POST /members` → `POST /members/{id}/email-verification` → `POST …/email-verification/confirm`(`linked`) → `GET /members/{id}/kyc`가 `approved`가 아니면 `POST …/kyc/documents`×3 + `POST …/kyc` → `kyc.approved`/`kyc.rejected` 웹훅. 모든 회원이 이메일 인증을 해야 KYC·카드 등록을 할 수 있다.
- **공카드 등록**: `POST /members/{id}/registration-orders`(`card_number`, `asset`, `network`, 회원 `wallet_address`) → 회원이 그 지갑에서 `deposit_address`로 `amount_due`~`max_amount` 입금(60분 안, 만료 시 웹훅 없음) → `order.deposit_confirmed` → `card.registered`(카드 `inactive`) → `POST /cards/{id}/activate`(`activation_code`, 앱이 만든 `encrypted_pin`) → `card.activated`.
- **충전**: `GET /cards/{id}/topup-quote?amount=` → `POST /cards/{id}/topup-orders` → 입금 → `topup.completed`. 회원별 진행 중 주문은 등록·충전 합쳐 1건.
- **카드 관리**: 조회·잔액, `freeze`/`unfreeze`(`card.status_changed`), `sensitive`(JWE), `pin-verification` → `pin`.
- **거래**: `GET /transactions?card_id=&type=payment,reversal,refund,adjustment`, 웹훅 `authorization.*`·`transaction.posted`.

## 디버깅 순서

1. `X-Request-Id`와 `error.code`·`details`를 먼저 본다(`message`로 분기하지 않는다).
2. `401 Invalid API key or signature.` → 고정값 self-test → 키·비밀키 환경 짝 → `/partner/v1` 경로 → 쿼리 그대로 → 본문 바이트 동일 → 4번째 줄(고유키/빈 줄) → 같은 서명 재사용 여부. `sign_request` 스크립트의 `canonical` 출력과 한 줄씩 비교한다.
3. `401 … outside the allowed window` → 시계·초 단위. `403 ip_not_allowed` → 나가는 IP 등록. `403 environment_unavailable` → 활성화되지 않은 운영 키 사용.
4. `409 idempotency_key_reused` → 의도마다 새 키를 만드는지, 재시도만 같은 키인지. `409 request_in_progress` → 1초 뒤 같은 키.
5. 업무 오류(409·422)는 `references/errors.md` 3절의 다음 행동을 따른다.

## 코드 검토 체크리스트

- [ ] 비밀키·웹훅 키를 비밀 저장소에서 읽고, 로그·응답·클라이언트 코드에 없다.
- [ ] 서명 고정값 테스트가 단위 테스트로 들어 있다(POST·GET 두 개).
- [ ] 본문을 한 번 직렬화해 그 바이트로 서명하고 그대로 보낸다. 쿼리 문자열도 한 번 만든다.
- [ ] 요청마다 새 timestamp, POST마다 `Idempotency-Key`, 재시도는 같은 키. 키를 DB에 남겨 재시작 뒤에도 같은 키를 쓴다.
- [ ] `retryable`·`Retry-After`·타임아웃 처리, 401/400/422 무한 재시도 없음. JSON 없는 `429`를 처리한다.
- [ ] 웹훅: 원문 바이트 검증 → 300초 → `event_id` 중복 제거(유니크) → 2xx → 비동기 처리 → 최신 상태 조회. 환경별 키.
- [ ] PIN·카드 상세정보 평문이 서버에 없다. `encrypted_pin`·`encrypted`를 저장·로그하지 않는다.
- [ ] 금액은 decimal 문자열 처리, 화면 표시용 계산도 half-up 센트.
- [ ] 목록은 `has_more`/`next_cursor`로 끝까지 읽고, `from`/`to`의 `+`를 `%2B`로 인코딩한다.
- [ ] 주문 만료(`expires_at`)는 웹훅이 없으므로 조회로 확인한다.
- [ ] `X-Request-Id`를 요청마다 로그에 남긴다.
- [ ] 테스트 전용 API·고정 코드 가정이 운영 경로에 없다.

## 스크립트

Node.js 20 이상(외부 패키지 없음, `jwe_pin.mjs`만 `jose` 필요 → `scripts/`에서 `npm i`), Python 3.9 이상(표준 라이브러리). 키는 환경변수 `MOA_PARTNER_KEY_ID`, `MOA_PARTNER_SECRET`, `MOA_WEBHOOK_SECRET`에서 읽고 출력하지 않는다. 모든 스크립트에 `--self-test`가 있다.

| 스크립트 | 용도 |
|---|---|
| `scripts/sign_request.mjs` · `scripts/sign_request.py` | 서명 헤더·원문(canonical) 출력, `--curl`로 실행 가능한 curl 명령 |
| `scripts/verify_webhook.mjs` · `scripts/verify_webhook.py` | `X-Moa-Signature` 검증(시각 허용 범위 포함), 실패 사유 출력 |
| `scripts/partner_client.mjs` | 서명·멱등·재시도 정책이 들어간 최소 클라이언트(`call(method, path, body)`) |
| `scripts/jwe_pin.mjs` | PIN JWE 생성(테스트 확인용. 운영은 회원 기기에서) |

예: `node scripts/sign_request.mjs --method POST --path /partner/v1/members --body '{"email":"user@example.com","partner_member_id":"u-1029"}'`

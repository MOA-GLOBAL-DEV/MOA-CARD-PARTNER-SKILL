# Express 예제: 웹훅 수신 + 파트너 API 호출

파트너사 서버의 최소 골격이다. 스킬의 `scripts/partner_client.mjs`(서명·멱등·재시도)와 `scripts/verify_webhook.mjs`(웹훅 서명 검증)를 그대로 가져다 쓴다.

```bash
cd examples/express-webhook
npm i
export MOA_PARTNER_KEY_ID=pk_test_...     # 테스트 키
export MOA_PARTNER_SECRET=sk_test_...     # 서버에만 보관
export MOA_WEBHOOK_SECRET=whsec_...       # 테스트 환경 웹훅 서명 키
npm start
```

| 경로 | 내용 |
|---|---|
| `POST /webhooks/moa` | 원문 바이트로 `X-Moa-Signature` 검증 → `event_id` 중복 제거 → 2xx → 비동기로 최신 상태 조회 |
| `POST /api/moa/members` | 앱 → 파트너사 서버 → `POST /partner/v1/members` |
| `POST /api/moa/cards/:cardId/activate` | 앱이 만든 `encrypted_pin`(JWE)을 그대로 전달 |
| `GET /api/moa/pin-encryption-key` | PIN 암호화 공개키를 앱에 전달 |

로컬에서 웹훅을 받으려면 공개 HTTPS 주소(포트 443 또는 8443)가 필요하다. 터널 서비스 주소를 테스트 환경 웹훅 주소로 등록하고 회사에 `ping` 테스트 전송을 요청한다.

운영에 가져갈 때 바꿀 것: 메모리 중복 제거 → DB 유니크 제약, 메모리 큐 → 작업 큐, 앱 요청 인증(파트너사 로그인 세션), 로그에서 개인정보 마스킹.

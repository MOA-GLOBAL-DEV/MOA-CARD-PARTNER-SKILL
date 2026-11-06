# 인증·서명·멱등·허용 IP·레이트리밋

모든 요청은 **파트너사 서버에서만** 보낸다. 비밀키(`sk_…`)는 서버의 비밀 저장소에만 두고 앱·웹·저장소(git)·로그에 넣지 않는다.

## 1. 요청 헤더

| 헤더 | 언제 | 값 |
|---|---|---|
| `X-Moa-Key-Id` | 모든 요청 | 키 ID `pk_test_…` / `pk_live_…` |
| `X-Moa-Timestamp` | 모든 요청 | Unix 시각 **초**(정수). 서버 시각과 ±300초 안. 밀리초(13자리)는 시각 범위 오류 |
| `X-Moa-Signature` | 모든 요청 | `v1=` + HMAC-SHA256 16진수 소문자 64자 |
| `Idempotency-Key` | **모든 POST** | 요청 고유키. 1~255자(UUID 권장). 없거나 255자 초과면 `400 invalid_request` |
| `Content-Type` | 본문이 있을 때 | `application/json` |

- 키·시각·허용 IP·이용 정지·환경 확인은 **본문을 받기 전**에 한다. 여기서 막히면 본문을 읽지 않고 응답한 뒤 연결을 닫는다(`Connection: close`). 서명이 틀린 경우도 연결을 닫는다.
- 없는 경로도 인증을 먼저 한다. 인증하지 않은 요청은 경로와 상관없이 `401`, 인증한 요청만 없는 경로에 `404 not_found`.
- 서버는 서명의 16진수 대소문자를 가리지 않지만, 소문자로 보낸다.

## 2. 서명 원문(canonical) — 5줄

5줄을 LF(`\n`) 하나로 잇는다. **마지막 줄 뒤에는 줄바꿈을 넣지 않는다.**

| 줄 | 항목 | 값 |
|---|---|---|
| 1 | timestamp | `X-Moa-Timestamp` 헤더 값 그대로 |
| 2 | METHOD | 대문자(`GET`, `POST`) |
| 3 | path_with_query | **`/partner/v1`부터** 쿼리 문자열까지 **보낸 그대로**. 예: `/partner/v1/members?limit=10` |
| 4 | idempotency_key | 보낸 `Idempotency-Key` 값 그대로. 헤더를 보내지 않으면(GET) **빈 문자열**(줄은 남긴다) |
| 5 | body_sha256 | 보낸 본문 **바이트**의 SHA-256(16진수 소문자). 본문이 없으면 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

```text
canonical = timestamp + "\n" + METHOD + "\n" + path_with_query + "\n" + idempotency_key + "\n" + body_sha256
signature = hex(HMAC-SHA256(key = 비밀키(sk_…) 문자열의 UTF-8 바이트, message = canonical))
X-Moa-Signature: v1=<signature>
```

자주 틀리는 곳:
- 비밀키는 `sk_test_…` **문자열 전체**를 HMAC 키로 쓴다(base64 디코딩하지 않는다).
- 경로에 `/partner/v1`을 빠뜨린다. 문서의 짧은 표기(`POST /members`)를 그대로 서명하면 401.
- 쿼리 순서·인코딩을 서명 뒤에 바꾼다. **URL 문자열을 먼저 만들고 → 그 문자열로 서명하고 → 같은 문자열로 요청**한다. `+09:00`의 `+`는 쿼리에서 `%2B`.
- 서명한 뒤 HTTP 라이브러리가 객체를 다시 JSON으로 직렬화한다(공백·키 순서·이스케이프가 바뀜). **서명한 바이트를 그대로 보낸다**(문자열/버퍼로 전달).
- GET인데 4번째 줄을 지운다(빈 줄을 남겨야 한다).

## 3. 검증용 고정값

문서 전용 가짜 비밀키다. 직접 구현한 서명 함수가 아래 값을 내는지 먼저 확인한다(`scripts/sign_request.mjs --self-test`, `scripts/sign_request.py --self-test`).

### 3.1 POST

| 항목 | 값 |
|---|---|
| 비밀키 | `sk_test_TestSecretForDocumentationOnly0000000000000` |
| X-Moa-Timestamp | `1793928225` (2026-11-06T01:23:45Z) |
| 메서드 · 경로 | `POST` `/partner/v1/members` |
| Idempotency-Key | `7f3c2a10-5b8e-4c1d-9a6f-2e4b8d0c1a35` |
| 본문(공백 없이 이 바이트 그대로) | `{"email":"user@example.com","partner_member_id":"u-1029"}` |
| 본문 SHA-256 | `0c14b4384d77f3e98410d6043f1af826ad251bb6be678fa9fad42d8ff50fc798` |
| X-Moa-Signature | `v1=25a4a6baf576fb3ded36b501a6139b36941a191eabc6895fa244d58230042823` |

계산 순서:
1. 본문 문자열을 UTF-8 바이트로 바꿔 SHA-256 → `0c14b438…0fc798`
2. 5줄을 `\n`으로 잇는다.
   ```text
   1793928225
   POST
   /partner/v1/members
   7f3c2a10-5b8e-4c1d-9a6f-2e4b8d0c1a35
   0c14b4384d77f3e98410d6043f1af826ad251bb6be678fa9fad42d8ff50fc798
   ```
3. 비밀키로 원문의 HMAC-SHA256 → 16진수 소문자 → `25a4a6ba…042823`
4. 앞에 `v1=`을 붙여 `X-Moa-Signature`에 넣는다.

### 3.2 GET(4번째 줄이 빈 줄)

| 항목 | 값 |
|---|---|
| 비밀키 · 시각 | 3.1과 같음 |
| 메서드 · 경로 | `GET` `/partner/v1/members?partner_member_id=u-1029` |
| Idempotency-Key | 보내지 않음(빈 문자열) |
| 본문 | 없음 → `e3b0c442…7852b855` |
| X-Moa-Signature | `v1=3fd357c7aed5d76a43613ef7df241e32ac65736e0d19743faea604ac8e3dc9b8` |

```text
1793928225
GET
/partner/v1/members?partner_member_id=u-1029

e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

※ 고정값은 계산 확인용이다. 실제 요청은 매번 현재 시각으로 서명하고, 같은 서명을 두 번 보내지 않는다(5절).

## 4. 코드

외부 패키지 없이 동작한다. 실제 호출·재시도는 `scripts/partner_client.mjs`, 헤더만 만들 때는 `scripts/sign_request.mjs`·`scripts/sign_request.py`를 쓴다.

### Node.js

```javascript
const crypto = require('node:crypto');

function signRequest(secret, timestamp, method, pathWithQuery, idempotencyKey, rawBody) {
  const canonical = [
    timestamp,
    method.toUpperCase(),
    pathWithQuery,
    idempotencyKey || '',
    crypto.createHash('sha256').update(rawBody || '', 'utf8').digest('hex'),
  ].join('\n');
  return 'v1=' + crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}

// 사용: 본문 문자열을 한 번 만들고, 그 문자열로 서명하고, 같은 문자열을 보낸다
const rawBody = JSON.stringify({ email: 'user@example.com', partner_member_id: 'u-1029' });
const timestamp = Math.floor(Date.now() / 1000).toString();
const idempotencyKey = crypto.randomUUID(); // POST만. 재시도는 같은 값
const signature = signRequest(process.env.MOA_PARTNER_SECRET, timestamp, 'POST', '/partner/v1/members', idempotencyKey, rawBody);
```

### Python(3.9 이상, 표준 라이브러리)

```python
import hashlib, hmac, json

def sign_request(secret, timestamp, method, path_with_query, idempotency_key, raw_body):
    """raw_body: 실제로 보낼 bytes"""
    canonical = "\n".join([
        timestamp, method.upper(), path_with_query, idempotency_key or "",
        hashlib.sha256(raw_body).hexdigest(),
    ])
    return "v1=" + hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()

raw_body = json.dumps({"email": "user@example.com", "partner_member_id": "u-1029"},
                      ensure_ascii=False, separators=(",", ":")).encode("utf-8")
# requests를 쓴다면 json= 대신 data=raw_body로 보낸다(다시 직렬화하지 않게)
```

### Java(17 이상, 외부 라이브러리 없음)

```java
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class MoaSigner {
    public static String signRequest(String secret, String timestamp, String method, String pathWithQuery,
                                     String idempotencyKey, byte[] rawBody) throws Exception {
        String bodySha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(rawBody));
        String canonical = String.join("\n", timestamp, method.toUpperCase(), pathWithQuery,
                idempotencyKey == null ? "" : idempotencyKey, bodySha);
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return "v1=" + HexFormat.of().formatHex(mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8)));
    }
}
// Spring RestClient/WebClient를 쓰면 객체 대신 서명한 byte[]/String을 본문으로 넘긴다
```

## 5. 서명은 한 번만 쓴다(재시도는 새 시각으로)

- 서버는 검증을 통과한 서명을 **600초 동안 기억**한다. 똑같은 요청(같은 시각·메서드·경로·요청 고유키·본문)을 다시 보내면 `401 authentication_failed`(재전송 공격 방지).
- 재시도·폴링은 요청마다 **그때 시각으로 새로 서명**한다. 같은 초 안에 똑같은 요청을 두 번 보내야 하면 다음 초의 시각으로 서명한다.
- POST 재시도 = **같은 `Idempotency-Key` + 새 시각·새 서명**. 고유키가 같으므로 두 번 처리되지 않는다.
- 요청 고유키가 서명 원문에 들어가므로, 가로챈 요청의 고유키만 바꿔 보내도 401이다.

## 6. 요청 고유키(Idempotency-Key)

파트너사·환경별로 24시간 보관한다.

| 상황 | 결과 |
|---|---|
| 같은 키 + 같은 요청(경로·본문), 처음 요청이 끝남 | 처음 응답(상태 코드·본문)을 그대로. `Idempotent-Replayed: true`. 본문의 `request_id`는 처음 값, `X-Request-Id`는 이번 값 |
| 위와 같으나 회원 이메일이 든 성공 응답(`POST /members`, `POST …/email-verification/confirm`) | 상태 코드·처음 `request_id`는 같고 **`data`는 `null`**. `GET /members/{member_id}`로 다시 읽는다 |
| 처음 요청이 4xx로 끝남 | 같은 4xx를 그대로. 입력을 고쳐 다시 보내려면 **새 키** |
| 처음 요청이 5xx로 끝남 | 같은 키로 다시 보내면 다시 처리 |
| 같은 키에 다른 경로·본문 | `409 idempotency_key_reused` |
| 처음 요청이 아직 처리 중 | `409 request_in_progress`(`retryable: true`, `Retry-After: 1`) |
| `POST /cards/{card_id}/sensitive` | 키는 필수지만 응답을 저장하지 않는다. 같은 키로 다시 보내면 새로 암호화한 응답 |

- 카드 발급사를 부르는 요청(KYC 서류 등록, KYC 신청, 등록·충전 주문, 활성화, PIN 변경, 정지·해제)은 5xx 뒤에도 키를 그 요청에 묶어 둔다. 같은 요청이면 다시 처리하고(상태 전이가 중복을 막는다), 다른 요청이면 `409 idempotency_key_reused`.
- 키는 **"회원의 한 번의 의도"마다** 만든다(버튼 한 번 = 키 하나). 네트워크 오류로 다시 보낼 때는 그 키를 다시 쓴다.
- 응답을 받지 못한 POST(타임아웃 등)는 **같은 키로** 다시 보낸다. 새 키로 보내면 같은 처리가 두 번 일어날 수 있다.
- 구현 팁: 키를 만들자마자 파트너사 DB의 "요청 시도" 행에 저장하고(회원·작업 종류·키), 재시도 작업이 그 행을 읽게 하면 서버 재시작 뒤에도 같은 키를 쓴다.

## 7. 허용 IP

- 요청은 그 환경에 등록한 공인 IP(나가는 IP)에서만 받는다. 아니면 `403 ip_not_allowed`. 등록된 IP가 없으면 모든 요청이 거절된다.
- 단일 주소 또는 CIDR로 등록한다. 운영 환경은 IPv4 `/24`, IPv6 `/48`보다 넓은 대역을 등록할 수 없다. 테스트·운영은 따로 등록한다.
- 회사가 본 접속 IP는 `GET /ping`의 `client_ip`로 확인한다(허용 IP에서 호출한 경우).
- 서버 이전, 클라우드 NAT 게이트웨이 교체 등으로 나가는 IP가 바뀌면 **미리** 새 IP를 등록한다.

## 8. 레이트리밋과 시도 제한

| 대상 | 한도 | 넘으면 |
|---|---|---|
| API Key별 | 초당 20회 | `429 rate_limited`, `Retry-After: 1` |
| 파트너사 전체(환경별, 모든 키 합산) | 초당 40회 | `429 rate_limited`, `Retry-After: 1` |
| 접속 IP별(회사 네트워크 앞단) | 초당 10회(순간 20회), 동시 연결 20개 | `429`(**JSON 본문 없음**) |
| 인증번호 요청(이메일 인증, PIN 변경) | 대상별 1분에 1번, 하루(UTC) 5번 | `429 rate_limited`, `Retry-After` |
| 인증번호·활성화 코드 입력 | 대상별 24시간에 5번까지 틀릴 수 있음 | `422 verification_locked` |
| 카드 상세정보 조회 | 카드별 시간당 10번 | `429 rate_limited`, `Retry-After` |

- `429`는 `Retry-After`(초) 뒤에 **새 시각으로 다시 서명**해 보낸다.
- 한 IP에서 초당 10회를 넘지 않게 조절한다. 앞단의 `429`는 JSON이 아닐 수 있으므로 본문 파싱 실패를 별도 오류로 처리하지 않는다.

## 9. 연결 확인 `GET /ping`

본문·요청 고유키가 필요 없다. 키·서명·허용 IP를 한 번에 확인한다.

```json
{
  "request_id": "req_01jbz3k8m2q4r6t8v0w2y4a6c8",
  "data": { "partner_id": "ptn_01jbz0a1b2c3d4e5f6g7h8j9k0", "environment": "test", "key_id": "pk_test_DocExample000001", "client_ip": "203.0.113.10" }
}
```

## 10. 자주 나는 인증 오류 점검표

| 응답 | 점검할 것 |
|---|---|
| `401` + `X-Moa-Key-Id, X-Moa-Timestamp and X-Moa-Signature headers are required.` | 세 헤더를 모두 넣었는지, 값이 비어 있지 않은지 |
| `401` + `X-Moa-Timestamp is outside the allowed window (±300 seconds).` | 서버 시계(NTP), 초 단위인지(밀리초 아님), 숫자만 넣었는지 |
| `401` + `Invalid API key or signature.` | ① 키 ID·비밀키가 같은 환경의 짝인지 ② 키가 폐기·만료되지 않았는지 ③ 경로에 `/partner/v1`을 넣었는지 ④ 쿼리를 보낸 그대로 넣었는지 ⑤ 서명한 본문과 보낸 본문이 같은 바이트인지 ⑥ 4번째 줄에 보낸 고유키(GET은 빈 줄)를 넣었는지 ⑦ 같은 서명을 다시 보내지 않았는지(재시도·폴링 포함) |
| `403 ip_not_allowed` | 그 환경의 허용 IP에 서버의 나가는 IP가 등록되어 있는지(`GET /ping`의 `client_ip`는 허용 IP에서만 보인다) |
| `403 environment_unavailable` | 운영 키(`pk_live_`)가 아직 활성화되지 않았는지(회사 담당자에게 확인) |
| `403 partner_suspended` | 회사 담당자에게 문의 |
| `400` + `Idempotency-Key header is required for POST requests.` | POST(본문 없는 POST 포함)에 `Idempotency-Key`를 넣었는지 |
| `400` + `Request body exceeds … bytes.` | 본문 64KB(KYC 서류 등록 4MB) 이하인지, `Content-Encoding`(gzip 등)을 붙이지 않았는지 |

※ `Invalid API key or signature.`는 키가 없을 때·폐기·만료·서명 불일치·같은 서명 재전송에 모두 같은 문구다. 원인을 좁히려면 3절 고정값으로 서명 함수부터 확인하고, `sign_request` 스크립트의 `canonical` 출력과 직접 만든 원문을 한 줄씩 비교한다.

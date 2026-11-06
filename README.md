# MOA 카드 파트너 API 스킬

MOA 카드 파트너 API를 연동하는 파트너사 개발자를 위한 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) / Agent Skills 스킬이다. Claude가 파트너사 서버 코드에 요청 서명, 멱등 처리, 회원·이메일 인증·KYC, 실물 공카드 등록·활성화(JWE PIN), 카드 관리, 충전, 거래 내역, 웹훅 수신을 구현하거나 오류를 고칠 때 이 스킬의 규칙과 명세를 따른다.

- 명세 기준: 파트너 API 연동 가이드 v1.0
- Base URL: `https://api.moacard.io/partner/v1`

## 이용 가능 환경

- **지금 파트너사가 먼저 쓸 수 있는 것은 테스트 환경(`pk_test_…` 키)이다.** 입금 확인·KYC 결과·카드 등록·결제를 모의로 처리하고, 테스트 전용 API로 전체 흐름을 시험할 수 있다.
- **운영 환경(`pk_live_…` 키)은 추후 오픈하며, 회사가 별도로 공지한다.** 열리기 전에 운영 키로 부르면 `403 environment_unavailable`이 온다.
- 테스트 키·허용 IP·웹훅 주소 등록은 MOA 파트너 담당자에게 요청한다.

## 구성

```
README.md
.claude-plugin/
  plugin.json                     # Claude Code 플러그인 매니페스트
  marketplace.json                # 이 저장소를 플러그인 마켓플레이스로 추가할 때 사용
skills/moa-card-partner-api/
  SKILL.md                        # 스킬 본문: 작업 절차, 반드시 지킬 규칙, 파일 안내
  references/                     # 필요할 때만 읽는 상세 명세
    auth-and-signing.md           # 헤더, 서명 원문 5줄, 검증용 고정값, 멱등, 허용 IP, 레이트리밋, 401 점검표
    conventions.md                # 응답 봉투, 커서 페이지, 요청 추적 ID, 오류 형식, 본문 제한
    endpoints.md                  # 41개 엔드포인트 전체: 필드·제약·응답 예시·주요 오류
    objects-and-statuses.md       # Member, Card, Order, Transaction, Event와 상태값
    flows.md                      # 온보딩, 공카드 등록·활성화, 카드 상세정보, PIN 변경, 충전, 거래, 재시도
    webhooks.md                   # 전송 형식, 서명 검증, 재전송 일정, 중복 제거, 이벤트별 payload
    errors.md                     # 오류 코드표(재시도 여부·회원 안내 문구)와 코드별 다음 행동
    test-environment.md           # 테스트 전용 API, 고정 코드, 테스트 이메일·입금 주소, 시나리오
  scripts/
    sign_request.mjs / .py        # 서명 헤더·원문 출력, curl 명령 생성
    verify_webhook.mjs / .py      # 웹훅 X-Moa-Signature 검증
    partner_client.mjs            # 서명·멱등·재시도 정책이 들어간 최소 클라이언트
    jwe_pin.mjs                   # PIN JWE 생성(테스트 확인용)
    package.json                  # jwe_pin.mjs용 jose 의존성
examples/express-webhook/         # Express 예제: 웹훅 수신 + API 호출
```

## 설치

### 1) 개인 스킬로(모든 프로젝트에서 사용)

```bash
git clone https://github.com/MOA-GLOBAL-DEV/MOA-CARD-PARTNER-SKILL.git
mkdir -p ~/.claude/skills
cp -R MOA-CARD-PARTNER-SKILL/skills/moa-card-partner-api ~/.claude/skills/
```

### 2) 프로젝트 스킬로(팀이 함께 사용)

연동 코드가 있는 저장소에 넣고 커밋하면 팀원 모두 같은 스킬을 쓴다.

```bash
mkdir -p <프로젝트>/.claude/skills
cp -R MOA-CARD-PARTNER-SKILL/skills/moa-card-partner-api <프로젝트>/.claude/skills/
```

### 3) Claude Code 플러그인으로

Claude Code 안에서:

```text
/plugin marketplace add MOA-GLOBAL-DEV/MOA-CARD-PARTNER-SKILL
/plugin install moa-card-partner@moa-card-partner
```

터미널에서:

```bash
claude plugin marketplace add MOA-GLOBAL-DEV/MOA-CARD-PARTNER-SKILL
claude plugin install moa-card-partner@moa-card-partner
```

내려받은 폴더를 바로 시험할 때는 `claude --plugin-dir ./MOA-CARD-PARTNER-SKILL`로 실행한다.

### 4) 다른 Agent Skills 호환 도구

`skills/moa-card-partner-api` 폴더를 그 도구의 스킬 폴더에 복사한다. `SKILL.md`의 frontmatter(`name`, `description`)와 `references/`·`scripts/` 상대 경로를 그대로 둔다.

### 스크립트 준비

- Node.js 20 이상. `sign_request.mjs`, `verify_webhook.mjs`, `partner_client.mjs`는 외부 패키지가 필요 없다.
- `jwe_pin.mjs`만 [`jose`](https://github.com/panva/jose)가 필요하다: `cd skills/moa-card-partner-api/scripts && npm i`
- Python 3.9 이상(표준 라이브러리만): `sign_request.py`, `verify_webhook.py`

## 사용 예

스킬을 설치한 뒤 Claude Code에 이렇게 요청한다. 스킬은 MOA 파트너 API 작업이라고 판단되면 자동으로 쓰이고, `/moa-card-partner-api`로 직접 부를 수도 있다(플러그인으로 설치했다면 `/moa-card-partner:moa-card-partner-api`).

- "우리 Spring Boot 서버에 MOA 파트너 API 클라이언트를 만들어 줘. 서명, Idempotency-Key, 재시도까지."
- "NestJS로 MOA 웹훅 수신 컨트롤러를 만들고 event_id 중복 제거를 넣어 줘."
- "`401 Invalid API key or signature.`가 나와. 서명 코드를 보고 원인을 찾아 줘."
- "회원 등록부터 이메일 인증, KYC 신청까지 Python(FastAPI) 서버 흐름을 구현해 줘."
- "React Native 앱에서 PIN을 JWE로 암호화하고, 서버는 평문을 보지 않게 활성화 API를 연결해 줘."
- "테스트 환경 시나리오(회원 등록 → 카드 활성화 → 충전 → 결제)를 처음부터 끝까지 돌리는 스크립트를 써 줘."

스크립트를 직접 쓸 때:

```bash
cd skills/moa-card-partner-api/scripts
node sign_request.mjs --self-test            # 서명 함수 고정값 확인(키 불필요)
python3 verify_webhook.py --self-test        # 웹훅 검증 고정값 확인
node partner_client.mjs --self-test          # 로컬 모의 서버로 서명·멱등·재시도 확인

export MOA_PARTNER_KEY_ID=pk_test_...        # 테스트 키(셸 기록에 남지 않게 주의)
export MOA_PARTNER_SECRET=sk_test_...
node partner_client.mjs GET /ping
node sign_request.mjs --method GET --path /partner/v1/ping --curl
```

## 보안 주의

- 비밀키(`sk_…`)와 웹훅 서명 키(`whsec_…`)를 Claude와의 대화나 프롬프트, 코드, 저장소에 붙여 넣지 않는다. 환경변수나 시크릿 매니저로 전달한다. 스크립트는 키를 출력하지 않는다.
- 문서·스크립트에 있는 `sk_test_TestSecretForDocumentationOnly…`, `whsec_TestWebhookSecretForDocumentationOnly…`는 서명 계산 확인용 가짜 값이다.
- 파트너 API는 파트너사 서버에서만 부른다. PIN과 카드 상세정보는 회원 기기에서만 암호화·복호화한다.
- API Key 유출이 의심되면 즉시 MOA 파트너 담당자에게 알리고 폐기·재발급을 요청한다.

## 라이선스

(추후 기재)

## 문의

MOA 파트너 담당자: (추후 기재)

문의할 때는 응답의 `X-Request-Id`(`req_…`)를 함께 알려 주면 빠르게 확인할 수 있다.

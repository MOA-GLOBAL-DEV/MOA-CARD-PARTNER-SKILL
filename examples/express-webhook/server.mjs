// 파트너사 서버 최소 예제(Express): MOA 웹훅 수신 + 파트너 API 호출
// - 실행: npm i && MOA_PARTNER_KEY_ID=pk_test_... MOA_PARTNER_SECRET=sk_test_... MOA_WEBHOOK_SECRET=whsec_... npm start
// - 키는 환경변수(또는 시크릿 매니저)에서만 읽는다. 이 예제는 키를 출력하지 않는다
// - 데모용으로 중복 제거·작업 큐를 메모리에 둔다. 운영에서는 DB(유니크 제약)·작업 큐로 바꾼다
import express from 'express';
import { createPartnerClient } from '../../skills/moa-card-partner-api/scripts/partner_client.mjs';
import { checkMoaWebhook } from '../../skills/moa-card-partner-api/scripts/verify_webhook.mjs';

const WEBHOOK_SECRET = process.env.MOA_WEBHOOK_SECRET;
const PORT = Number(process.env.PORT ?? 3000);
if (!WEBHOOK_SECRET) throw new Error('MOA_WEBHOOK_SECRET 환경변수가 필요합니다');

const moa = createPartnerClient({ log: (m) => console.warn('[moa]', m) }); // MOA_PARTNER_KEY_ID / MOA_PARTNER_SECRET
const app = express();

// ─── 1) 웹훅 수신: 원문 바이트로 검증하므로 express.json()보다 먼저, express.raw()로 받는다 ───

const processedEventIds = new Set(); // 운영: DB 테이블(event_id 유니크)
const jobs = []; // 운영: 작업 큐

app.post('/webhooks/moa', express.raw({ type: 'application/json', limit: '1mb' }), (req, res) => {
  const check = checkMoaWebhook(WEBHOOK_SECRET, req.get('X-Moa-Signature'), req.body);
  if (!check.ok) {
    console.warn('웹훅 서명 검증 실패:', check.reason, req.get('X-Moa-Event-Id'));
    return res.status(400).end();
  }
  const event = JSON.parse(req.body.toString('utf8'));
  if (processedEventIds.has(event.event_id)) return res.status(200).end(); // 같은 event_id 재전송
  processedEventIds.add(event.event_id);
  jobs.push(event);
  res.status(200).end(); // 10초 안에 2xx. 처리는 비동기로
  setImmediate(drainJobs);
});

async function drainJobs() {
  while (jobs.length > 0) {
    const event = jobs.shift();
    try {
      await handleEvent(event);
    } catch (err) {
      console.error('웹훅 처리 실패(다시 시도 대상):', event.event_id, err.message);
    }
  }
}

/** 알림은 순서가 보장되지 않으므로 받은 뒤 최신 상태를 조회해 저장한다 */
async function handleEvent(event) {
  const { type, data } = event;
  switch (type) {
    case 'kyc.approved':
    case 'kyc.rejected': {
      const r = await moa.call('GET', `/members/${data.member_id}/kyc`);
      console.log('KYC 상태', data.member_id, r.body?.data);
      break;
    }
    case 'order.deposit_confirmed':
    case 'card.registered':
    case 'card.registration_failed':
    case 'topup.completed':
    case 'topup.failed': {
      const path = data.order.type === 'registration' ? 'registration-orders' : 'topup-orders';
      const r = await moa.call('GET', `/${path}/${data.order.order_id}`);
      console.log('주문 상태', data.order.order_id, r.body?.data?.status);
      break;
    }
    case 'card.activated':
    case 'card.activation_failed':
    case 'card.status_changed': {
      const r = await moa.call('GET', `/cards/${data.card.card_id}`);
      console.log('카드 상태', data.card.card_id, r.body?.data?.status);
      break;
    }
    case 'authorization.approved':
    case 'authorization.declined':
    case 'transaction.posted':
      console.log('거래', data.transaction.transaction_id, data.transaction.type, data.transaction.status, data.transaction.amount);
      break;
    case 'ping':
      console.log('MOA 테스트 전송 수신', data.partner_id);
      break;
    default:
      console.log('모르는 알림 종류(무시):', type); // 새 종류가 추가될 수 있다
  }
}

// ─── 2) 앱이 부르는 파트너사 API(예시). 앱은 MOA를 직접 부르지 않고 이 서버를 부른다 ───

app.use(express.json({ limit: '64kb' }));

// 실제 서비스에서는 파트너사 로그인 세션으로 회원을 식별하고 권한을 확인한다(이 예제는 생략)
app.post('/api/moa/members', async (req, res) => {
  const { email, partnerMemberId } = req.body;
  // Idempotency-Key는 "회원의 한 번의 의도"마다. 앱이 보낸 요청 ID를 쓰면 앱 재시도에도 같은 키가 된다
  const idempotencyKey = req.get('X-Client-Request-Id') ?? undefined;
  const r = await moa.call('POST', '/members', { email, partner_member_id: partnerMemberId }, { idempotencyKey });
  res.status(r.status).json(toAppResponse(r));
});

// 활성화: 앱이 회원 기기에서 만든 encrypted_pin(JWE)을 받아 그대로 넘긴다. 저장·로그하지 않는다
app.post('/api/moa/cards/:cardId/activate', async (req, res) => {
  const { activationCode, encryptedPin } = req.body;
  const r = await moa.call(
    'POST',
    `/cards/${encodeURIComponent(req.params.cardId)}/activate`,
    { activation_code: activationCode, encrypted_pin: encryptedPin },
    { idempotencyKey: req.get('X-Client-Request-Id') ?? undefined },
  );
  res.status(r.status).json(toAppResponse(r));
});

// PIN 암호화 공개키는 앱에 내려 줘도 된다(공개키)
app.get('/api/moa/pin-encryption-key', async (_req, res) => {
  const r = await moa.call('GET', '/pin-encryption-key');
  res.status(r.status).json(toAppResponse(r));
});

/** 앱에는 필요한 것만: 성공 data, 실패면 code·user_message·retryable과 문의용 request_id */
function toAppResponse(r) {
  if (r.body?.error) {
    const { code, user_message, retryable } = r.body.error;
    return { error: { code, user_message, retryable }, request_id: r.requestId };
  }
  return { data: r.body?.data ?? null, request_id: r.requestId };
}

app.listen(PORT, () => console.log(`listening on :${PORT} (웹훅 POST /webhooks/moa)`));

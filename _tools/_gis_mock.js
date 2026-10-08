/* =============================================================================
   محاكي Google Identity Services لاختبارات Node
   -----------------------------------------------------------------------------
   معرّف عميل Google مضمَّن في sync.js الآن، فكل الاختبارات تسلك مسار GIS.
   هذه الدالة تُهيّئ `google.accounts` في سياق الاختبار.
   ============================================================================= */
'use strict';

/**
 * @param {object} sb سياق vm (يحتاج sb.google ليكون موجوداً)
 * @param {object} o  { mode: 'ok'|'cancel'|'no-token'|'init-fail', delay: ms }
 * @returns {object} عدّاد الاستدعاءات
 */
function installGis(sb, o) {
  o = o || {};
  /* نستخدم كائن العدّادات المُمرَّر إن وُجد، ليتتبّع الاختبار كل الاستدعاءات */
  const calls = o.calls || {};
  if (calls.token === undefined) calls.token = 0;
  if (calls.init === undefined) calls.init = 0;
  if (calls.idInit === undefined) calls.idInit = 0;
  if (calls.gis === undefined) calls.gis = 0;
  const mode = o.mode || 'ok';
  const delay = o.delay == null ? 15 : o.delay;

  sb.google = {
    accounts: {
      oauth2: {
        initTokenClient(cfg) {
          calls.init++;
          /* نحتفظ بالتهيئة ليتحقق الاختبار من خيارات مثل FedCM */
          sb.__gisCfgSeen = { client_id: cfg.client_id, scope: cfg.scope, use_fedcm_for_prompt: cfg.use_fedcm_for_prompt };
          /* العميل الحقيقي واحد ويُعاد استخدامه، ويُستبدل نداؤه (callback)
             قبل كل طلب. لذلك نقرأ client.callback عند الطلب — لا النداء
             الأصلي — تماماً كما تفعل مكتبة Google الحقيقية. */
          const client = { callback: cfg.callback };
          client.requestAccessToken = function () {
            calls.token++;
            calls.gis++;
            if (o.throwOnRequest) throw new Error('request boom');
            const cb = client.callback || cfg.callback;
            setTimeout(() => {
              if (mode === 'cancel') {
                cb({ error: 'access_denied', error_description: 'أُلغي' });
              } else if (mode === 'no-token') {
                /* رمز وصول بلا رمز هوية — الشائع على الهاتف */
                cb({
                  access_token: 'at', token_type: 'Bearer', expires_in: 3599,
                  scope: 'openid email profile', authuser: '0', prompt: 'none',
                  oauth_metadata: {}, gis_params: {}, iss: 'https://accounts.google.com',
                });
              } else if (mode === 'none') {
                /* لا رمز وصول ولا رمز هوية */
                cb({ authuser: '0', prompt: 'none', scope: '' });
              } else {
                cb({ access_token: 'at', id_token: 'FAKE_ID_TOKEN' });
              }
            }, delay);
          };
          return client;
        },
      },
      id: {
        initialize(cfg) {
          calls.idInit++;
          /* نحاكي رفض النطاق إن طُلب ذلك */
          if (o.idError && cfg && cfg.error_callback) {
            setTimeout(() => cfg.error_callback({ type: o.idError }), 10);
          }
        },
        renderButton() {}, prompt() {}, cancel() {}, disableAutoSelect() {},
      },
    },
  };
  if (mode === 'init-fail') {
    sb.google.accounts.oauth2.initTokenClient = () => { throw new Error('init boom'); };
  }
  return calls;
}

module.exports = { installGis };

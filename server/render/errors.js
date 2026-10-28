// Errors of the render service, with the HTTP status, whether trying again can help, and
// a message the user can act on (Georgian; the code is for programs and logs).

export const MESSAGES = {
  disabled: 'AI დიზაინის გენერაცია ჯერ ჩართული არ არის. ადმინისტრატორმა უნდა დააყენოს სერვისი.',
  not_configured: 'AI სერვისი ბოლომდე არ არის მოწყობილი (გასაღები, ბიუჯეტი ან მონაცემთა ბაზა აკლია). მიმართე ადმინისტრატორს.',
  access_required: 'გენერაციისთვის საჭიროა წვდომის კოდი.',
  access_denied: 'წვდომის კოდი არასწორია.',
  forbidden_origin: 'მოთხოვნა დაუშვებელი მისამართიდან მოვიდა.',
  consent_required: 'გენერაციამდე დაადასტურე, რომ ესკიზი და მასალები გაეგზავნება AI სერვისს და რომ 18 წლის ხარ.',
  estimate_changed: 'სავარაუდო ღირებულება შეიცვალა. გადახედე და დაადასტურე ხელახლა.',
  too_large: 'მოთხოვნა ძალიან დიდია. შეამცირე სურათების რაოდენობა ან ზომა.',
  bad_request: 'მოთხოვნა არასწორია.',
  bad_scene: 'სცენის აღწერა არასწორია ან არასრულია.',
  scene_mismatch: 'სცენის ვერსია არ ემთხვევა. განაახლე გვერდი და სცადე თავიდან.',
  bad_image: 'ესკიზის ან მასალის სურათი არასწორია.',
  too_expensive: 'ეს პარამეტრები ერთ სურათზე დაშვებულ ზღვარს აჭარბებს. აირჩიე დაბალი ხარისხი.',
  rate_limited: 'ძალიან ბევრი მოთხოვნა ცოტა ხანში. მოიცადე ერთი წუთი.',
  busy: 'წინა გენერაცია ჯერ არ დასრულებულა.',
  user_quota: 'დღევანდელი ლიმიტი ამოიწურა. სცადე ხვალ.',
  daily_quota: 'სერვისის დღევანდელი ლიმიტი ამოიწურა. სცადე ხვალ.',
  budget_exhausted: 'ამ თვის ბიუჯეტი ამოიწურა. მიმართე ადმინისტრატორს.',
  provider_auth: 'AI სერვისმა გასაღები არ მიიღო. ადმინისტრატორმა უნდა შეამოწმოს API გასაღები.',
  provider_refused: 'AI სერვისმა ეს მოთხოვნა უარყო (უსაფრთხოების წესები). შეცვალე ოთახი, ხედი ან მასალები და სცადე თავიდან.',
  provider_rate_limited: 'AI სერვისი ახლა გადატვირთულია. სცადე რამდენიმე წუთში.',
  provider_timeout: 'AI სერვისმა დროულად ვერ უპასუხა. სცადე თავიდან.',
  provider_error: 'AI სერვისის შეცდომა. სცადე თავიდან ცოტა ხანში.',
  provider_bad_response: 'AI სერვისმა სურათი არ დააბრუნა. სცადე თავიდან.',
  cancelled: 'გენერაცია გაუქმდა.',
  internal: 'სერვერის შეცდომა. სცადე თავიდან.',
};

export class RenderError extends Error {
  constructor(code, status, { retryable = false, retryAfter = null, detail = null, charged = null } = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
    this.detail = detail; // for logs only, never shown with provider secrets
    this.charged = charged; // true / false / null (unknown) — whether the provider may bill it
  }
}

export function errorResponse(err, extra = {}) {
  const e = err instanceof RenderError ? err : new RenderError('internal', 500);
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  if (e.retryAfter) headers['retry-after'] = String(e.retryAfter);
  return new Response(JSON.stringify({
    error: { code: e.code, message: MESSAGES[e.code] || MESSAGES.internal, retryable: e.retryable, retryAfter: e.retryAfter, ...extra },
  }), { status: e.status, headers });
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

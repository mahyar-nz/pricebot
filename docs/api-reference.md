# API

ریشه `/api/v1`؛ قرارداد فعلی `apps/api/src/openapi.ts` و endpoint `/api/v1/openapi.json`. موفقیت `{data: ...}` و خطا message/statusCode/requestId دارد. DTOهای کامل Swagger هنوز لازم‌اند.

کوکی نشست و Origin معتبر برای mutation لازم است. `x-organization-id` فقط سازمان انتخابی است؛ عضویت در سرور بررسی می‌شود. مبلغ رشته decimal و واحد IRR/IRT است. گروه‌ها: auth، products، rules، recommendations، executions، stores، billing، dashboard، organization، team، audit، admin/settings و public/config.

مثال جریان در `tests/e2e.test.mjs` به‌صورت اجرایی ثبت شده است.

## اتصال فقط‌خواندنی فروشگاه

POST /stores: name، url HTTPS، currency از IRR/IRT. برای bridge، connectionKind="bridge" و bridgeToken با الگوی pb_ به علاوه 64 نویسه hex لازم است. readOnly پیش‌فرض true است؛ false برای bridge رد می‌شود. روش پیشین connectionKind="woocommerce" به consumerKey و consumerSecret نیاز دارد. پاسخ فقط readOnly/connectionKind و مشخصات غیرمحرمانه دارد.

POST /stores/:id/test و /sync خواندن واقعی انجام می‌دهند. PATCH /stores/:id با mode=AUTOMATIC برای اتصال فقط‌خواندنی ممنوع است؛ execute نیز پیش از شبکه آن را رد می‌کند. فرم فعلی UI هیچ اتصال با اجازه نوشتن نمی‌سازد.

## ترب

GET /torob/connection وضعیت غیرمحرمانه؛ PUT همان مسیر با {token:string} ذخیره رمزنگاری‌شده برای OWNER/ADMIN؛ POST /torob/test آزمون shop؛ POST /torob/catalog خواندن محصولات خود فروشگاه. درخواست‌های شبکه به اشتراک فعال و محدودیت 10 بار در ساعت هر سازمان وابسته‌اند. این داده، منبع قیمت رقبا نیست.

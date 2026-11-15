# تحویل ادامه کار — ۱۵ نوامبر ۲۰۲۶

پروژه همین پوشه است؛ بازسازی از صفر لازم نیست. .env و .local محرمانه و ignore هستند. مشخصات ورود WordPress کاربر در فایل‌ها ذخیره نشده است.

الزام کاربر: فارسی؛ ترب اولویت اصلی؛ فروش اشتراک و سرور قابل ارتقا؛ FixBoxIran صرفاً برای تست/بررسی است و هیچ قیمت آن نباید تغییر کند. افزونه ترب با ترب‌پی تفاوت دارد. اجازه بررسی و در صورت نیاز نصب داده شده، اما افزونه آزمایشی جدید هنوز فقط بسته‌بندی محلی شده و روی سایت اصلی نصب نشده است.

خروجی جدید: integrations/wordpress/pricing-bridge و بسته apps/web/public/downloads/pricing-bridge-0.1.0.zip. این افزونه فقط GET محصولات منتشرشده ساده/متغیر و variation دارد؛ توکن محدود در header، هش در WP، مالک باید همچنان مدیر باشد. ساخت/لغو کلید نیازمند nonce و مجوز مدیر است. deactivation کلید را حذف می‌کند. از سفارش/مشتری/قیمت‌نویسی پشتیبانی نمی‌کند. staging واقعی هنوز لازم است.

SaaS: createStore از connectionKind=bridge و bridgeToken پشتیبانی می‌کند. اطلاعات در credentialCiphertext ذخیره می‌شود؛ schema جدید لازم نشد. readOnly پیش‌فرض true و برای bridge اجباری است. credentialهای قدیمی بدون مجوز صریح هم read-only محسوب می‌شوند. پیش از حالت AUTOMATIC و execute و در آداپتور، نوشتن مسدود می‌شود. UI این فرم فقط read-only می‌سازد. کد Woo موجود با کلید مستقیم نیز باقی است.

تست‌ها: core99، API14، worker1، HTTP21، OTP6 = 141 مستقل؛ PHP13 جدا. vitest core به test/**/*.test.ts محدود شد تا dist دوباره شمرده نشود. Node types برای TypeScript7 core صریح شد. آزمایش زنده فقط diagnostic افزونه ترب و GET نمونه Store API بوده، نه write یا competitor access.

گزارش نمونه: docs/evidence/fixbox-catalog-audit.json و docs/fixbox-readonly-review.md. 8 محصول ساده منطبق و 2 متغیر قرنطینه؛ محصول956 بازه 2.1 تا8.5 میلیون تومان دارد. ابزار audit-store-sample فقط GET، بدون credential و خروجی بدون بازنویسی است.

سرویس‌های محلی ممکن است روی 3000/4000 و PostgreSQL54329 روشن باشند؛ قبل از restart وضعیت پورت‌ها را بررسی کنید. هنگام build ویندوز standalone وب را متوقف کنید تا EBUSY رخ ندهد. حساب‌های آزمون موقت باید فقط با شناسه دقیق خودشان پاک شوند؛ کل DB پاک نشود.

ادامه از NEXT-STEPS.md؛ عرضه عمومی هنوز به داده مجاز رقبا، صف قیمت، billing/پرداخت، بازیابی/MFA، staging/Redis/backup/load و آزمون واقعی افزونه نیاز دارد. پیشنهاد سرور و حدود آن در server-sizing.md ثبت شده است.

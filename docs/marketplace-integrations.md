# وضعیت اتصال‌ها

registry در packages/core/src/connectors/registry.ts و API عمومی است. قابلیت هر اتصال و اعتبارسنجی زنده جدا گزارش می‌شوند.

- WooCommerce REST v3: خواندن/همگام‌سازی با کلید خواندن؛ نوشتن کنترل‌شده در کد وجود دارد ولی روی فروشگاه کاربر آزمایش نشده است.
- رابط WordPress اختصاصی 0.1.0: بسته فقط‌خواندنی و روش اتصال SaaS ساخته شد. API محدود به کاتالوگ منتشرشده؛ مشتری/سفارش/پرداخت در دامنه آن نیست. تست PHP شبیه‌سازی است؛ نصب staging واقعی باقی است.
- Store API عمومی: GET نمونه ۱۰ محصول FixBoxIran واقعی موفق؛ برای بررسی نمونه بدون رمز استفاده شد و فروشگاه را در SaaS به عنوان متصل/قابل‌نوشتن ثبت نکرد.
- Torob Shop API: آداپتور رسمی کاتالوگ خود فروشگاه، توکن رمزنگاری‌شده و صفحه تنظیمات؛ آزمون قرارداد/خطا/صفحه‌بندی موفق. توکن زنده ارائه نشده. مستندات آن دریافت رقبا را بیان نمی‌کند.
- افزونه رسمی ترب روی FixBoxIran: diagnostic اتصال سالم؛ جهت جریان محصولات فروشگاه به ترب است. ترب‌پی برای پرداخت اقساطی مستقل است.
- ملی‌پیامک: ارسال الگویی پیاده شده؛ OTP با ارسال شبیه‌سازی و DB واقعی آزموده شد. حساب/الگوی زنده هنوز آزموده نشده.
- باسلام: مرز OAuth آماده، نیازمند app/scopes واقعی. دیگر بازارها طبق registry هنوز دسترسی مجاز و آزمون زنده می‌خواهند.

منابع: [Woo REST](https://woocommerce.github.io/woocommerce-rest-api-docs/)، [Store API](https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/products/)، [ترب Shop API](https://github.com/torob/Torob-Sync/blob/main/shop_api.md)، [ملی‌پیامک](https://github.com/Melipayamak/melipayamak-node)، [باسلام](https://github.com/basalam/openapi-docs).

هیچ collector مبتنی بر parser نمونه WordPress فعال نشده است. وجود مستندات یا diagnostic سالم، مجوز و پوشش رقبا را ثابت نمی‌کند.

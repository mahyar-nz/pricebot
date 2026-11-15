# استقرار و عملیات

اجرای Docker در این میزبان آزمایش نشده است. فایل Compose برای PostgreSQL و Redis و build سرویس‌ها فراهم شده؛ قبل از تولید روی Linux staging اجرا و بازبینی شود.

Compose اکنون web مستقل Next، API، worker نگهداری، PostgreSQL 18.7 و Redis با AOF/noeviction دارد. PostgreSQL محلی آزمون‌ها 18.6 است؛ ارتقای واقعی به 18.7 هنوز آزموده نشده. workflow در .github/workflows/verify.yml نوشته شده اما در GitHub اجرا نشده است.

پس از آماده‌کردن secrets اختصاصی و .env مناسب staging: image را بسازید، PostgreSQL/Redis را راه بیندازید، migration را صریحاً با `docker compose run --rm api pnpm db:migrate` اجرا کنید، seed تنظیمات را جدا اجرا کنید و سپس web/api/worker را شروع کنید. migration هنگام boot خودکار اجرا نمی‌شود. این مسیر پیشنهادی هنوز باید روی Linux تأیید شود؛ NODE_ENV=production نیازمند WEB_ORIGIN عمومی HTTPS است و حالت test پیامک را رد می‌کند.

پورت‌های 3000 و4000 فقط روی loopback میزبان منتشر شده‌اند. reverse proxy با TLS و WEB_ORIGIN صحیح لازم است؛ PostgreSQL و Redis نباید عمومی شوند. API_INTERNAL_URL برای rewrite وب در زمان build مقدار http://api:4000 دارد؛ تغییر آن نیازمند build دوباره است. دارایی‌های public/static در image به standalone منتقل می‌شوند. بسته افزونه نیز در public/downloads است؛ پس از تغییر کد افزونه با scripts/package-bridge.py بازتولید شود.

چک‌لیست تولید: تمام موارد NEXT-STEPS مربوط به ایمنی تکمیل، HTTPS و reverse proxy محدود، API در شبکه خصوصی، secrets اختصاصی بدون رمز پیش‌فرض، دسترسی دیتابیس کمینه، محدودیت خروجی شبکه، backup رمزگذاری‌شده، آزمون restore، retention، مانیتورینگ صف و خطا، کلید توقف اضطراری، آزمایش فروشگاه مجاز و بار انجام شود.

Backup با `pg_dump` در محیط امن و نگهداری جدا از میزبان انجام شود؛ خروجی backup و کلید رمزگذاری credential هر دو برای restore لازم‌اند. rollback برنامه با نسخهٔ قبلی فقط در صورت سازگاری schema مجاز است؛ مهاجرت down خودکار یا پاک‌سازی دیتابیس توصیه نمی‌شود.

لاگ API شناسهٔ درخواست و نوع خطا دارد؛ رمز، OTP، Cookie یا کلید فروشگاه را log نکنید. endpoint health برای پایش داخلی است. Worker موجود تنها نگهداری رکوردهای امنیتی است و جای scheduler قیمت را نمی‌گیرد.

برای مشخصات شروع و مراحل جداسازی دیتابیس/worker، server-sizing.md را ببینید. برآورد ۸ vCPU اختصاصی، ۳۲GB RAM و۲۵۰–۵۰۰GB NVMe تضمین ظرفیت نیست. پیش از تعهد تجاری، آزمون بار و بازیابی و دسترسی شبکه به سرویس‌های ایرانی ضروری است.

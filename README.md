# Pricing Platform — پایهٔ سامانهٔ قیمت‌گذاری

سامانهٔ فارسی چندسازمانی با Next.js، NestJS، PostgreSQL/Prisma و موتور مالی TypeScript. این نسخه پایهٔ قابل اجراست و هنوز محصول کامل آمادهٔ عرضه نیست. وضعیت واقعی در [گزارش پیشرفت](docs/implementation-progress.md) و [کار بعدی](docs/NEXT-STEPS.md) ثبت شده است.

## اجرای محلی

پیش‌نیاز: Node.js 24 و pnpm 11.25.0. در ریشهٔ همین پروژه:

```powershell
pnpm install
pnpm setup
pnpm db:local
```

ترمینال دیتابیس را باز نگه دارید. در ترمینال دوم:

```powershell
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm build
pnpm dev
```

وب: http://localhost:3000 — API: http://localhost:4000/api/v1/health — قرارداد API: http://localhost:4000/api/v1/openapi.json

`setup` اسرار تصادفی در `.env` محلی ایجاد می‌کند و فایل موجود را بازنویسی نمی‌کند. PostgreSQL محلی در `.local/postgres` ماندگار است. ابزار محلی ویندوز برای رفع محدودیت طول مسیر یک کپی اجرایی در `.local/pg-runtime` می‌سازد. این ابزار مخصوص توسعه است؛ استقرار از PostgreSQL مستقل استفاده می‌کند.

در صورت مشکل بازبینی خودکار pnpm، ابزارهای نصب‌شده را مستقیم اجرا کنید؛ مثلاً `node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json`. نسخه‌ها در lockfile ثبت شده‌اند؛ Prisma 8 آزمایشی وارد پروژه نشده است.

## ساخت اولین مدیر

هیچ گذرواژهٔ پیش‌فرض یا حساب مدیر seed نمی‌شود. متغیرهای `BOOTSTRAP_ADMIN_EMAIL`، `BOOTSTRAP_ADMIN_PASSWORD` (حداقل ۱۲ کاراکتر) و `BOOTSTRAP_ADMIN_NAME` را فقط در محیط محلی امن تنظیم کنید؛ سپس:

```powershell
pnpm --filter @pricing/api admin:bootstrap
```

پس از اجرا متغیرها را پاک کنید. دستور اگر مدیر قبلی یا ایمیل موجود باشد، از ارتقای ضمنی حساب جلوگیری می‌کند. رمز را در chat، Git یا فایل اشتراکی قرار ندهید.

## بررسی کیفیت

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm test:otp
php tests/wordpress-bridge.php
python scripts/package-bridge.py
```

تست سرتاسری به API و PostgreSQL محلی روشن نیاز دارد؛ فقط رکوردهای موقت همان اجرا را پاک می‌کند، نه کل دیتابیس.

## ساختار

```text
apps/web/       صفحات عمومی، ورود، داشبورد و مدیریت فارسی
apps/api/       احراز هویت، سازمان، کاتالوگ، پیشنهاد و اجرای کنترل‌شده
apps/workers/   صف نگهداری رکوردهای امنیتی BullMQ
packages/core/  محاسبات decimal، تطبیق، کیفیت داده و آداپتورها
scripts/       راه‌اندازی محلی و تولید تنظیمات توسعه
tests/         آزمون HTTP و جداسازی سازمان‌ها
docs/          معماری، محدودیت‌ها، گزارش نمونه و تحویل ادامهٔ کار
```

برای استفاده از ایران‌سنس، فایل‌های دارای مجوز را در `apps/web/public/fonts` قرار دهید. نسخه مخزن از فونت جایگزین Tahoma استفاده می‌کند. آرشیو WordPress فقط در پوشهٔ کاری بیرون محصول بررسی شد و وابستگی runtime نیست. هیچ قیمت واقعی از بازارهای ایرانی seed نمی‌شود.

تنظیمات لازم و پیش‌نیاز اتصال‌های زنده در [وابستگی‌های خارجی](docs/external-dependencies.md)؛ استقرار و موارد باز در [راهنمای استقرار](docs/deployment.md).

## رابط وردپرس و بررسی عرضه

افزونه آزمایشی فقط‌خواندنی در `integrations/wordpress/pricing-bridge` است. بسته نصب در `apps/web/public/downloads/pricing-bridge-0.1.0.zip` و صفحه فروشگاه‌های سامانه قرار دارد. ابتدا staging؛ سپس ساخت کلید از صفحه افزونه و ثبت آن در روش «افزونه رابط». این کلید مخصوص کاتالوگ است، نه کلید مدیریت WordPress. روی FixBoxIran نصب نشده و هیچ قیمت واقعی تغییر نکرده است.

اسناد جدید: [گزارش آمادگی عرضه](docs/release-readiness.md)، [بررسی فقط‌خواندنی فروشگاه و ترب](docs/fixbox-readonly-review.md)، [سرور قابل ارتقا](docs/server-sizing.md). تنظیم Shop API ترب در داشبورد ← بازارها ← ترب است؛ داده آن متعلق به خود فروشگاه است و منبع قیمت رقبا نیست.

برای اجرای standalone محلی پس از build: `node scripts/start-web.mjs`. هنگام build دوباره روی Windows، ابتدا همین سرور محلی وب را متوقف کنید تا فایل‌های standalone قفل نباشند.

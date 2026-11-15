# پایگاه داده

Schema در `apps/api/prisma/schema.prisma`، migration اولیه در `prisma/migrations/202611150001_initial` است. هویت/نشست، سازمان/عضویت، فروشگاه/محصول/مشاهده، قاعده/پیشنهاد/اجرا، اشتراک/فاکتور، تنظیمات و audit جدا هستند.

قیمت Decimal(24,4) با واحد صریح؛ timestamp مبنای UTC؛ SKU در سازمان یکتا و membership زوج user/organization یکتا است. version محصول و idempotency اجرا ذخیره می‌شوند. migration روی PostgreSQL واقعی موفق بود.

RLS و FK ترکیبی همهٔ روابط tenant، canonical catalog و plan version هنوز کامل نیستند. سرویس‌ها tenant scope را کنترل می‌کنند؛ تست cross-tenant موفق بود. تغییرات بعدی باید migration افزایشی باشند، نه reset.

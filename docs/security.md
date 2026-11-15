# امنیت

موجود: scrypt، hash نشست، HttpOnly/SameSite، Origin check، rate limit پایدار، OTP HMAC، AES-GCM اسرار، tenant scope، نقش و audit، DNS pinning و TLS اتصال خارجی.

تست‌های موجود منع دسترسی بین سازمان‌ها، منع admin، CSRF، عدم افشای credential در config و logout را بررسی کردند. این نتایج جای ممیزی امنیتی یا تست نفوذ نیستند.

باز: MFA/recovery/SMTP، key rotation، race OTP، RLS، بررسی جامع SSRF و connector و race خارجی قیمت. REST WooCommerce تضمین CAS برای همهٔ تغییرات خارجی ندارد؛ قبل از فعال‌سازی واقعی باید محدودیت‌ها و تداخل سایر افزونه‌ها روی staging بررسی شوند.

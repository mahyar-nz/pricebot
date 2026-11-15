<?php
/**
 * Plugin Name: رابط پایش قیمت فروشگاه
 * Description: اتصال فقط‌خواندنی محصولات و تنوع‌های ووکامرس به سامانه پایش قیمت. بدون تغییر قیمت یا دسترسی به سفارش‌ها.
 * Version: 0.1.0
 * Requires at least: 6.5
 * Requires PHP: 8.1
 * Requires Plugins: woocommerce
 * License: GPL-2.0-or-later
 * Text Domain: pricing-bridge
 */
defined('ABSPATH') || exit;

final class Pricing_Bridge {
    const OPTION = 'pricing_bridge_read_token';
    private static $new_token = '';
    private static $notice = '';

    public static function boot() {
        add_action('admin_menu', [__CLASS__, 'menu']);
        add_action('rest_api_init', [__CLASS__, 'routes']);
    }
    public static function menu() {
        $page = add_submenu_page('woocommerce', 'رابط پایش قیمت', 'رابط پایش قیمت', 'manage_options', 'pricing-bridge', [__CLASS__, 'page']);
        add_action('load-' . $page, [__CLASS__, 'settings_action']);
    }
    public static function settings_action() {
        nocache_headers();
        if (!current_user_can('manage_options') || !current_user_can('manage_woocommerce')) {
            wp_die('دسترسی مدیر فروشگاه لازم است.', '', ['response' => 403]);
        }
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') return;
        check_admin_referer('pricing_bridge_token');
        $action = isset($_POST['bridge_action']) ? sanitize_key(wp_unslash($_POST['bridge_action'])) : '';
        if ($action === 'revoke') {
            delete_option(self::OPTION);
            self::$notice = 'اتصال لغو شد. کلید قبلی دیگر قابل استفاده نیست.';
        } elseif ($action === 'generate') {
            if (!is_ssl() || !function_exists('wc_get_products')) wp_die('HTTPS و ووکامرس فعال لازم است.');
            $token = 'pb_' . bin2hex(random_bytes(32));
            $saved = update_option(self::OPTION, ['hash' => hash('sha256', $token), 'owner' => get_current_user_id(), 'created_at' => time()], false);
            if (!$saved) wp_die('ذخیره کلید انجام نشد. دوباره تلاش کنید.');
            self::$new_token = $token;
            self::$notice = 'کلید جدید ساخته شد؛ کلید قبلی باطل است. این کلید فقط همین بار نمایش داده می‌شود.';
        }
    }
    public static function page() {
        if (!current_user_can('manage_options') || !current_user_can('manage_woocommerce')) return;
        $connected = (bool) get_option(self::OPTION);
        echo '<div class="wrap" dir="rtl"><h1>رابط پایش قیمت — نسخه آزمایشی</h1>';
        echo '<p>این نسخه فقط محصولات منتشرشده، قیمت، موجودی و تنوع‌های آن‌ها را می‌خواند. هیچ مسیر تغییر قیمت، سفارش، مشتری یا پرداخت ندارد. افزونه ترب و ترب‌پی مستقل هستند.</p>';
        echo '<p>نشانی فروشگاه: <code dir="ltr">' . esc_html(home_url('/')) . '</code></p>';
        if (function_exists('get_woocommerce_currency')) echo '<p>واحد واقعی قیمت: <strong>' . esc_html(get_woocommerce_currency()) . '</strong></p>';
        echo '<p>وضعیت کلید: ' . ($connected ? 'ساخته شده؛ اتصال سامانه هنوز باید آزمایش شود.' : 'بدون کلید؛ دسترسی از راه دور بسته است.') . '</p>';
        if (self::$notice) echo '<div class="notice notice-info"><p>' . esc_html(self::$notice) . '</p></div>';
        if (self::$new_token) {
            echo '<p><label for="pricing-bridge-token">کلید اتصال را در فرم افزودن فروشگاه سامانه، روش «افزونه رابط» وارد کنید:</label></p>';
            echo '<input id="pricing-bridge-token" class="large-text" type="text" readonly autocomplete="off" spellcheck="false" dir="ltr" value="' . esc_attr(self::$new_token) . '">';
            echo '<p>این کلید را در چت یا پشتیبانی نفرستید. برای اتصال فقط همان کادر امن سامانه را استفاده کنید.</p>';
        }
        echo '<form method="post">';
        wp_nonce_field('pricing_bridge_token');
        echo '<p><button class="button button-primary" name="bridge_action" value="generate">ساخت / تعویض کلید فقط‌خواندنی</button> ';
        echo '<button class="button" name="bridge_action" value="revoke">لغو اتصال</button></p></form>';
        echo '<p>ساخت یا تعویض کلید اتصال قبلی را قطع می‌کند. غیرفعال کردن افزونه نیز کلید را باطل می‌کند. هیچ داده‌ای هنگام نصب خودکار ارسال نمی‌شود.</p></div>';
    }
    public static function permission($request) {
        if (!is_ssl()) return new WP_Error('bridge_https_required', 'HTTPS required.', ['status' => 403]);
        $saved = get_option(self::OPTION, []);
        $token = $request->get_header('x-pricing-token');
        if (!is_array($saved) || empty($saved['hash']) || !is_string($token) || !preg_match('/^pb_[a-f0-9]{64}$/D', $token) || !hash_equals($saved['hash'], hash('sha256', $token))) {
            return new WP_Error('bridge_unauthorized', 'Invalid or revoked connection.', ['status' => 401]);
        }
        $owner = (int) ($saved['owner'] ?? 0);
        if (!$owner || !user_can($owner, 'manage_options') || !user_can($owner, 'manage_woocommerce')) return new WP_Error('bridge_owner_revoked', 'Owner permission revoked.', ['status' => 403]);
        if (!function_exists('wc_get_products')) return new WP_Error('bridge_woocommerce_required', 'WooCommerce unavailable.', ['status' => 503]);
        if (!in_array(get_woocommerce_currency(), ['IRR', 'IRT'], true)) return new WP_Error('bridge_currency_unsupported', 'Unsupported currency.', ['status' => 422]);
        return true;
    }
    public static function routes() {
        foreach (['/products', '/products/(?P<parent_id>\d+)/variations'] as $route) {
            register_rest_route('pricing-bridge/v1', $route, [
                'methods' => 'GET', 'permission_callback' => [__CLASS__, 'permission'], 'callback' => [__CLASS__, 'products'],
                'args' => [
                    'page' => ['default' => 1, 'type' => 'integer', 'minimum' => 1, 'maximum' => 1000],
                    'per_page' => ['default' => 100, 'type' => 'integer', 'minimum' => 1, 'maximum' => 100],
                ],
            ]);
        }
    }
    public static function products($request) {
        $query = ['status' => 'publish', 'limit' => (int) $request['per_page'], 'page' => (int) $request['page'], 'orderby' => 'ID', 'order' => 'ASC', 'type' => ['simple', 'variable']];
        if ($request['parent_id']) {
            $parent = wc_get_product((int) $request['parent_id']);
            if (!$parent || !$parent->is_type('variable') || $parent->get_status() !== 'publish' || get_post_field('post_password', $parent->get_id())) return new WP_Error('bridge_parent_missing', 'Parent unavailable.', ['status' => 404]);
            $query['type'] = 'variation';
            $query['parent'] = $parent->get_id();
        }
        // Full reads intentionally include all variants; a child edit need not modify its parent date.
        $products = wc_get_products($query);
        $result = [];
        foreach ($products as $product) {
            // Do not leak password-protected catalog fields to the bridge.
            if (get_post_field('post_password', $product->get_id())) return new WP_Error('bridge_protected_catalog', 'Protected product requires manual review.', ['status' => 409]);
            $result[] = self::serialize($product);
        }
        $response = new WP_REST_Response($result);
        $response->header('Cache-Control', 'no-store, private');
        return $response;
    }
    public static function serialize($product) {
        $attributes = [];
        foreach ($product->get_attributes() as $name => $attribute) {
            if (is_string($attribute)) {
                $term = taxonomy_exists($name) ? get_term_by('slug', $attribute, $name) : false;
                $attributes[] = ['name' => wc_attribute_label($name), 'option' => $term ? $term->name : $attribute];
            } elseif (is_object($attribute)) {
                $options = $attribute->is_taxonomy() ? wc_get_product_terms($product->get_id(), $attribute->get_name(), ['fields' => 'names']) : $attribute->get_options();
                $attributes[] = ['name' => wc_attribute_label($attribute->get_name()), 'options' => is_array($options) ? $options : []];
            }
        }
        $images = [];
        foreach (array_filter(array_merge([$product->get_image_id()], $product->get_gallery_image_ids())) as $image_id) {
            $src = wp_get_attachment_url($image_id);
            if ($src) $images[] = ['src' => $src];
        }
        $modified = $product->get_date_modified();
        return ['id' => $product->get_id(), 'parent_id' => $product->get_parent_id(), 'sku' => $product->get_sku(), 'name' => $product->get_name(),
            'type' => $product->get_type(), 'status' => $product->get_status(), 'currency' => get_woocommerce_currency(),
            'price' => $product->get_price(), 'regular_price' => $product->get_regular_price(), 'sale_price' => $product->get_sale_price(),
            'stock_status' => $product->get_stock_status(), 'stock_quantity' => $product->get_stock_quantity(),
            'date_modified_gmt' => $modified ? gmdate('Y-m-d\TH:i:s', $modified->getTimestamp()) : '', 'attributes' => $attributes, 'images' => $images];
    }
    public static function revoke() { delete_option(self::OPTION); }
}
Pricing_Bridge::boot();
register_deactivation_hook(__FILE__, ['Pricing_Bridge', 'revoke']);
register_activation_hook(__FILE__, function ($network_wide) {
    if ($network_wide) wp_die('فعال‌سازی شبکه‌ای پشتیبانی نمی‌شود؛ برای هر فروشگاه جداگانه فعال کنید.');
});

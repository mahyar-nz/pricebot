<?php
// Isolated contract/security harness. Does not load WordPress or access any real shop.
define('ABSPATH', __DIR__);
$state = ['ssl' => true, 'cap' => true, 'nonce' => true, 'saved' => [], 'routes' => [], 'currency' => 'IRT'];
function add_action(...$args) {}
function register_activation_hook(...$args) {}
function register_deactivation_hook(...$args) {}
function register_rest_route($namespace, $route, $args) { global $state; $state['routes'][$route] = $args; }
function get_option(...$args) { global $state; return $state['saved']; }
function update_option($key, $value, $autoload) { global $state; $state['saved'] = $value; return true; }
function delete_option($key) { global $state; $state['saved'] = []; }
function current_user_can($cap) { global $state; return $state['cap']; }
function user_can(...$args) { global $state; return $state['cap']; }
function get_current_user_id() { return 10; }
function is_ssl() { global $state; return $state['ssl']; }
function nocache_headers() {}
function check_admin_referer($key) { global $state; if (!$state['nonce']) throw new Exception('nonce'); }
function wp_die($text, ...$args) { throw new Exception($text); }
function wp_unslash($text) { return $text; }
function sanitize_key($text) { return preg_replace('/[^a-z_]/', '', $text); }
function wc_get_products($query) { return []; }
function get_woocommerce_currency() { global $state; return $state['currency']; }
class WP_Error { public function __construct(public $code, public $message, public $data) {} }
class Request { public function __construct(private $token) {} public function get_header($key) { return $this->token; } }
require __DIR__ . '/../integrations/wordpress/pricing-bridge/pricing-bridge.php';
$count = 0;
function check($condition, $message) { global $count; if (!$condition) throw new Exception($message); $count++; }
function denied($token, $code) { $result = Pricing_Bridge::permission(new Request($token)); return $result instanceof WP_Error && $result->code === $code; }
$token = 'pb_' . str_repeat('a', 64);
check(denied($token, 'bridge_unauthorized'), 'unconfigured bridge denied');
$state['saved'] = ['hash' => hash('sha256', $token), 'owner' => 10];
check(Pricing_Bridge::permission(new Request($token)) === true, 'valid read token accepted');
check(denied('pb_' . str_repeat('b', 64), 'bridge_unauthorized'), 'wrong token denied');
$state['ssl'] = false; check(denied($token, 'bridge_https_required'), 'plain HTTP denied'); $state['ssl'] = true;
$state['cap'] = false; check(denied($token, 'bridge_owner_revoked'), 'revoked owner denied'); $state['cap'] = true;
$state['currency'] = 'USD'; check(denied($token, 'bridge_currency_unsupported'), 'foreign currency denied'); $state['currency'] = 'IRT';
Pricing_Bridge::routes();
check(count($state['routes']) === 2 && count(array_filter($state['routes'], fn($r) => $r['methods'] !== 'GET')) === 0, 'all routes are GET catalog only');
$_SERVER['REQUEST_METHOD'] = 'GET'; $_POST['bridge_action'] = 'generate';
Pricing_Bridge::settings_action(); check($state['saved']['hash'] === hash('sha256', $token), 'GET cannot rotate credentials');
$_SERVER['REQUEST_METHOD'] = 'POST'; $state['nonce'] = false;
try { Pricing_Bridge::settings_action(); throw new Exception('unexpected success'); } catch (Exception $e) { check($e->getMessage() === 'nonce', 'CSRF rejected'); }
$state['nonce'] = true; Pricing_Bridge::settings_action();
check($state['saved']['hash'] !== hash('sha256', $token) && strlen($state['saved']['hash']) === 64 && !str_contains(json_encode($state['saved']), 'pb_'), 'rotation stores hash only');
check(denied($token, 'bridge_unauthorized'), 'old token revoked after rotation');
$_POST['bridge_action'] = 'revoke'; Pricing_Bridge::settings_action(); check($state['saved'] === [], 'explicit revoke clears token');
$state['saved'] = ['hash' => hash('sha256', $token), 'owner' => 10]; Pricing_Bridge::revoke(); check($state['saved'] === [], 'deactivation revokes token');
echo "PASS: $count isolated WordPress bridge security checks (not a real WordPress installation).\n";

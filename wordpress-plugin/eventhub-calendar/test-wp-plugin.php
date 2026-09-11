<?php
/**
 * Exercises the plugin's shortcode against a stubbed WordPress and the real
 * embed endpoint. The link rewriting is the part most likely to be subtly
 * wrong, so it is the part most tested here.
 *
 *   php test-wp-plugin.php http://127.0.0.1:5202
 */

$HOST = $argv[1] ?? 'http://127.0.0.1:5202';

define( 'ABSPATH', __DIR__ );
define( 'MINUTE_IN_SECONDS', 60 );
define( 'EVENTHUB_CAL_HOST', $HOST );

$GLOBALS['__transients'] = [];
$GLOBALS['__fetches']    = 0;
$GLOBALS['__caps']       = true;

function get_option( $k, $d = false ) { return $GLOBALS['__options'][ $k ] ?? $d; }
function get_transient( $k ) { return $GLOBALS['__transients'][ $k ] ?? false; }
function set_transient( $k, $v, $t ) { $GLOBALS['__transients'][ $k ] = $v; return true; }
function untrailingslashit( $s ) { return rtrim( $s, '/' ); }
function esc_url_raw( $s ) { return $s; }
function esc_url( $s ) { return htmlspecialchars( $s, ENT_QUOTES ); }
function esc_attr( $s ) { return htmlspecialchars( (string) $s, ENT_QUOTES ); }
function esc_html( $s ) { return htmlspecialchars( (string) $s, ENT_QUOTES ); }
function esc_html__( $s, $d = '' ) { return $s; }
function esc_html_e( $s, $d = '' ) { echo $s; }
function __( $s, $d = '' ) { return $s; }
function sanitize_key( $s ) { return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( $s ) ); }
function sanitize_text_field( $s ) { return trim( strip_tags( (string) $s ) ); }
function sanitize_title( $s ) { return strtolower( trim( (string) $s ) ); }
function wp_unslash( $s ) { return $s; }
function current_user_can( $c ) { return $GLOBALS['__caps']; }
function add_shortcode( $t, $f ) {}
function add_action( $a, $f ) {}
function add_options_page() {}
function register_setting() {}
function settings_fields() {}
function submit_button() {}
function disabled() {}
function get_permalink() { return 'https://host.example/events/'; }

function shortcode_atts( $pairs, $atts, $sc = '' ) {
	$out = [];
	foreach ( $pairs as $name => $default ) {
		$out[ $name ] = array_key_exists( $name, (array) $atts ) ? $atts[ $name ] : $default;
	}
	return $out;
}

function add_query_arg( $args, $url ) {
	$parts = explode( '#', $url, 2 );
	$base  = $parts[0];
	$sep   = strpos( $base, '?' ) === false ? '?' : '&';
	$q     = http_build_query( $args );
	return $q === '' ? $base : $base . $sep . $q;
}

function wp_parse_args( $s ) {
	parse_str( (string) $s, $r );
	return $r;
}

class WP_Error {
	private $c;
	private $m;
	public function __construct( $c, $m ) { $this->c = $c; $this->m = $m; }
	public function get_error_message() { return $this->m; }
}
function is_wp_error( $t ) { return $t instanceof WP_Error; }

function wp_remote_get( $url, $args = [] ) {
	$GLOBALS['__fetches']++;
	$ctx  = stream_context_create( [ 'http' => [ 'timeout' => 10, 'ignore_errors' => true ] ] );
	$body = @file_get_contents( $url, false, $ctx );
	$code = 0;
	foreach ( $http_response_header ?? [] as $h ) {
		if ( preg_match( '#^HTTP/\S+\s+(\d+)#', $h, $m ) ) { $code = (int) $m[1]; }
	}
	if ( false === $body ) { return new WP_Error( 'http', 'request failed' ); }
	return [ 'code' => $code, 'body' => $body ];
}
function wp_remote_retrieve_response_code( $r ) { return $r['code'] ?? 0; }
function wp_remote_retrieve_body( $r ) { return $r['body'] ?? ''; }

require __DIR__ . '/eventhub-calendar.php';

$fails = 0;
function check( $name, $cond, $extra = '' ) {
	global $fails;
	echo ( $cond ? 'PASS  ' : 'FAIL  ' ) . $name . ( $cond ? '' : '  <-- ' . $extra ) . "\n";
	if ( ! $cond ) { $fails++; }
}

// ---- happy path --------------------------------------------------------------
$html = eventhub_cal_shortcode( [ 'slug' => 'riverside' ] );
check( 'renders a wrapper', str_contains( $html, 'class="eventhub-calendar"' ) );
check( 'contains the calendar fragment', str_contains( $html, 'class="ehx"' ) );
check( 'contains real events', str_contains( $html, 'Harvest Festival' ), substr( $html, 0, 160 ) );
check( 'events are in the HTML, not fetched by JS', ! str_contains( $html, '<script' ) );
check( 'hostile event title stayed escaped', str_contains( $html, '&lt;img src=x' ) );

// ---- link rewriting ----------------------------------------------------------
check( 'no links point back at the platform embed endpoint',
	! str_contains( $html, EVENTHUB_CAL_HOST . '/api/embed' ),
	'platform embed URL leaked into the page' );
check( 'view links now point at this site',
	str_contains( $html, 'https://host.example/events/?ehview=week' ),
	'no rewritten view link found' );
preg_match( '/href="([^"]*ehon=[^"]*)"/', $html, $m );
check( 'date links now point at this site', ! empty( $m[1] ), 'no rewritten date link' );
check( 'rewritten date link keeps the view', ! empty( $m[1] ) && str_contains( $m[1], 'ehview=month' ), $m[1] ?? '' );
check( 'event links still go to the platform',
	str_contains( $html, '/events/e1' ), 'event deep links were rewritten by mistake' );

// ---- paging via query string -------------------------------------------------
$_GET = [ 'ehview' => 'list' ];
$list = eventhub_cal_shortcode( [ 'slug' => 'riverside' ] );
check( 'ehview switches the view', str_contains( $list, 'ehx-list' ), 'list view not rendered' );

$_GET = [ 'ehview' => 'month', 'ehon' => '2027-01-01' ];
$jan = eventhub_cal_shortcode( [ 'slug' => 'riverside' ] );
check( 'ehon moves the calendar', str_contains( $jan, 'January 2027' ), 'anchor ignored' );

$_GET = [ 'ehview' => '<script>', 'ehon' => 'nonsense' ];
$safe = eventhub_cal_shortcode( [ 'slug' => 'riverside' ] );
check( 'rejects a bogus view', str_contains( $safe, 'ehx-grid' ), 'fell through to something odd' );
check( 'bogus params are not reflected', ! str_contains( $safe, 'nonsense' ) && ! str_contains( $safe, '<script>' ) );
$_GET = [];

// ---- caching -----------------------------------------------------------------
$GLOBALS['__fetches'] = 0;
eventhub_cal_shortcode( [ 'slug' => 'riverside' ] );
eventhub_cal_shortcode( [ 'slug' => 'riverside' ] );
eventhub_cal_shortcode( [ 'slug' => 'riverside' ] );
check( 'repeat renders are served from cache', 0 === $GLOBALS['__fetches'], $GLOBALS['__fetches'] . ' fetches' );

// ---- bad input ---------------------------------------------------------------
check( 'missing slug tells an editor what to do',
	str_contains( eventhub_cal_shortcode( [] ), 'set a calendar slug' ) );
check( 'slug with a path traversal is refused',
	str_contains( eventhub_cal_shortcode( [ 'slug' => '../../etc/passwd' ] ), 'set a calendar slug' ) );
check( 'slug with a scheme is refused',
	str_contains( eventhub_cal_shortcode( [ 'slug' => 'http://evil.example' ] ), 'set a calendar slug' ) );

// ---- origin down -------------------------------------------------------------
$GLOBALS['__transients'] = [];
function_exists( 'x' );
$unknown = eventhub_cal_shortcode( [ 'slug' => 'no-such-calendar' ] );
check( 'a 404 from the platform is reported to an editor',
	str_contains( $unknown, 'unavailable' ), substr( $unknown, 0, 120 ) );

$GLOBALS['__caps']       = false;
$GLOBALS['__transients'] = [];
$visitor = eventhub_cal_shortcode( [ 'slug' => 'no-such-calendar' ] );
check( 'a visitor sees nothing rather than an error', '' === $visitor, $visitor );
$GLOBALS['__caps'] = true;

echo "\n" . ( 0 === $fails ? "ALL CHECKS PASSED" : "$fails CHECK(S) FAILED" ) . "\n";
exit( 0 === $fails ? 0 : 1 );

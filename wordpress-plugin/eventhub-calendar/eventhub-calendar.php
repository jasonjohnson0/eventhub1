<?php
/**
 * Plugin Name:       EventHub Calendar
 * Plugin URI:        https://github.com/jasonjohnson0/eventhub1
 * Description:       Embed an EventHub calendar with [eventhub_calendar]. Fetches a pre-rendered fragment server-side and caches it, so the events are in your page's HTML and search engines can index them.
 * Version:           1.0.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       eventhub-calendar
 *
 * @package EventHubCalendar
 */

defined( 'ABSPATH' ) || exit;

define( 'EVENTHUB_CAL_VERSION', '1.0.0' );
define( 'EVENTHUB_CAL_DEFAULT_HOST', 'https://sparkle-calendar-co.lovable.app' );

/**
 * Base URL of the EventHub platform.
 *
 * Define EVENTHUB_CAL_HOST in wp-config.php to lock it; otherwise the saved
 * setting is used.
 */
function eventhub_cal_host() {
	if ( defined( 'EVENTHUB_CAL_HOST' ) && EVENTHUB_CAL_HOST ) {
		$host = EVENTHUB_CAL_HOST;
	} else {
		$host = get_option( 'eventhub_cal_host', EVENTHUB_CAL_DEFAULT_HOST );
	}
	$host = esc_url_raw( trim( (string) $host ) );
	return untrailingslashit( $host ? $host : EVENTHUB_CAL_DEFAULT_HOST );
}

/**
 * Fetch one calendar fragment, cached in a transient.
 *
 * The fetch happens on the server, so the markup ends up in the HTML this site
 * returns. That is the whole point: a crawler sees the events without running
 * any JavaScript, and an ad blocker cannot strip the sponsors.
 *
 * @param string $slug  Calendar slug.
 * @param array  $args  view and on.
 * @return string|WP_Error
 */
function eventhub_cal_fetch( $slug, $args ) {
	$query = array_filter(
		array(
			'view' => $args['view'],
			'on'   => $args['on'],
		),
		'strlen'
	);

	$url = add_query_arg(
		$query,
		eventhub_cal_host() . '/api/embed/' . rawurlencode( $slug )
	);

	$key    = 'ehcal_' . md5( $url );
	$cached = get_transient( $key );
	if ( false !== $cached ) {
		return $cached;
	}

	$response = wp_remote_get(
		$url,
		array(
			'timeout'    => 5,
			'user-agent' => 'EventHub-Calendar-WP/' . EVENTHUB_CAL_VERSION,
		)
	);

	if ( is_wp_error( $response ) ) {
		return $response;
	}

	$code = wp_remote_retrieve_response_code( $response );
	$body = wp_remote_retrieve_body( $response );

	if ( 200 !== (int) $code || '' === $body ) {
		return new WP_Error(
			'eventhub_cal_http',
			sprintf( 'EventHub returned HTTP %d', (int) $code )
		);
	}

	// Five minutes matches the s-maxage the endpoint sets. A stale calendar for
	// a few minutes is preferable to hitting the origin on every page view.
	set_transient( $key, $body, 5 * MINUTE_IN_SECONDS );

	return $body;
}

/**
 * [eventhub_calendar slug="riverside" view="month" on="2026-10-01"]
 *
 * @param array $atts Shortcode attributes.
 * @return string
 */
function eventhub_cal_shortcode( $atts ) {
	$atts = shortcode_atts(
		array(
			'slug' => '',
			'view' => 'month',
			'on'   => '',
		),
		$atts,
		'eventhub_calendar'
	);

	$slug = strtolower( trim( $atts['slug'] ) );
	if ( ! $slug ) {
		$slug = strtolower( trim( (string) get_option( 'eventhub_cal_slug', '' ) ) );
	}

	// Same shape the platform validates, so a slug that cannot exist is never
	// turned into a request.
	if ( ! preg_match( '/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])$/', $slug ) ) {
		return eventhub_cal_notice(
			__( 'EventHub: set a calendar slug, either on the shortcode or under Settings → EventHub Calendar.', 'eventhub-calendar' )
		);
	}

	$allowed_views = array( 'month', 'week', 'list', 'agenda' );
	$view          = in_array( $atts['view'], $allowed_views, true ) ? $atts['view'] : 'month';

	$on = preg_match( '/^\d{4}-\d{2}-\d{2}$/', $atts['on'] ) ? $atts['on'] : '';

	// Let a visitor page through the calendar. These are the same parameters the
	// fragment's own links use, so navigation works with JavaScript disabled.
	// phpcs:disable WordPress.Security.NonceVerification.Recommended
	if ( isset( $_GET['ehview'] ) ) {
		$requested = sanitize_key( wp_unslash( $_GET['ehview'] ) );
		if ( in_array( $requested, $allowed_views, true ) ) {
			$view = $requested;
		}
	}
	if ( isset( $_GET['ehon'] ) ) {
		$requested = sanitize_text_field( wp_unslash( $_GET['ehon'] ) );
		if ( preg_match( '/^\d{4}-\d{2}-\d{2}$/', $requested ) ) {
			$on = $requested;
		}
	}
	// phpcs:enable WordPress.Security.NonceVerification.Recommended

	$result = eventhub_cal_fetch( $slug, compact( 'view', 'on' ) );

	if ( is_wp_error( $result ) ) {
		// Never show a visitor a plumbing error; only someone who can fix it.
		if ( current_user_can( 'edit_posts' ) ) {
			return eventhub_cal_notice(
				sprintf(
					/* translators: %s: error message */
					__( 'EventHub calendar unavailable: %s', 'eventhub-calendar' ),
					esc_html( $result->get_error_message() )
				)
			);
		}
		return '';
	}

	// Rewrite the fragment's own links so they stay on this site rather than
	// sending the visitor to the platform. The calendar keeps working without
	// JavaScript, on the customer's domain, which is what makes it indexable.
	$page = get_permalink();
	if ( $page ) {
		// Match the embed path on any origin. The fragment builds its own links
		// from PUBLIC_SITE_URL, which is not necessarily the host we fetched
		// from -- a custom domain in front of the platform makes them differ --
		// so anchoring the pattern to our host would silently stop rewriting.
		$result = preg_replace_callback(
			'#href="[^"]*?/api/embed/[^"?]*\?([^"]*)"#',
			static function ( $m ) use ( $page ) {
				$params = wp_parse_args( html_entity_decode( $m[1] ) );
				$local  = array();
				if ( ! empty( $params['view'] ) ) {
					$local['ehview'] = $params['view'];
				}
				if ( ! empty( $params['on'] ) ) {
					$local['ehon'] = $params['on'];
				}
				return 'href="' . esc_url( add_query_arg( $local, $page ) ) . '"';
			},
			$result
		);
	}

	return '<div class="eventhub-calendar">' . $result . '</div>';
}
add_shortcode( 'eventhub_calendar', 'eventhub_cal_shortcode' );

/**
 * Small admin-only notice block.
 *
 * @param string $message Already-escaped message.
 * @return string
 */
function eventhub_cal_notice( $message ) {
	return '<p style="padding:12px;border:1px dashed #ccc;border-radius:8px;color:#666">'
		. esc_html( $message ) . '</p>';
}

/* --------------------------------------------------------------- settings -- */

/**
 * Settings page under Settings.
 */
function eventhub_cal_menu() {
	add_options_page(
		__( 'EventHub Calendar', 'eventhub-calendar' ),
		__( 'EventHub Calendar', 'eventhub-calendar' ),
		'manage_options',
		'eventhub-calendar',
		'eventhub_cal_settings_page'
	);
}
add_action( 'admin_menu', 'eventhub_cal_menu' );

/**
 * Register settings.
 */
function eventhub_cal_register_settings() {
	register_setting(
		'eventhub_cal',
		'eventhub_cal_host',
		array(
			'type'              => 'string',
			'sanitize_callback' => 'esc_url_raw',
			'default'           => EVENTHUB_CAL_DEFAULT_HOST,
		)
	);
	register_setting(
		'eventhub_cal',
		'eventhub_cal_slug',
		array(
			'type'              => 'string',
			'sanitize_callback' => 'sanitize_title',
			'default'           => '',
		)
	);
}
add_action( 'admin_init', 'eventhub_cal_register_settings' );

/**
 * Clear cached fragments whenever the settings change.
 */
function eventhub_cal_flush_cache() {
	global $wpdb;
	$wpdb->query(
		"DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_ehcal_%' OR option_name LIKE '_transient_timeout_ehcal_%'"
	);
}
add_action( 'update_option_eventhub_cal_host', 'eventhub_cal_flush_cache' );
add_action( 'update_option_eventhub_cal_slug', 'eventhub_cal_flush_cache' );

/**
 * Render the settings page.
 */
function eventhub_cal_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$locked = defined( 'EVENTHUB_CAL_HOST' ) && EVENTHUB_CAL_HOST;
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'EventHub Calendar', 'eventhub-calendar' ); ?></h1>
		<form action="options.php" method="post">
			<?php settings_fields( 'eventhub_cal' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="eventhub_cal_host"><?php esc_html_e( 'EventHub URL', 'eventhub-calendar' ); ?></label></th>
					<td>
						<input name="eventhub_cal_host" id="eventhub_cal_host" type="url" class="regular-text"
							value="<?php echo esc_attr( get_option( 'eventhub_cal_host', EVENTHUB_CAL_DEFAULT_HOST ) ); ?>"
							<?php disabled( $locked ); ?> />
						<p class="description">
							<?php
							echo $locked
								? esc_html__( 'Locked by EVENTHUB_CAL_HOST in wp-config.php.', 'eventhub-calendar' )
								: esc_html__( 'Where EventHub is hosted.', 'eventhub-calendar' );
							?>
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="eventhub_cal_slug"><?php esc_html_e( 'Default calendar slug', 'eventhub-calendar' ); ?></label></th>
					<td>
						<input name="eventhub_cal_slug" id="eventhub_cal_slug" type="text" class="regular-text"
							value="<?php echo esc_attr( get_option( 'eventhub_cal_slug', '' ) ); ?>" />
						<p class="description"><?php esc_html_e( 'Used when the shortcode has no slug of its own.', 'eventhub-calendar' ); ?></p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>

		<h2><?php esc_html_e( 'Shortcode', 'eventhub-calendar' ); ?></h2>
		<ul>
			<li><code>[eventhub_calendar]</code> &mdash; <?php esc_html_e( 'the default calendar set above', 'eventhub-calendar' ); ?></li>
			<li><code>[eventhub_calendar slug="riverside"]</code></li>
			<li><code>[eventhub_calendar slug="riverside" view="list"]</code> &mdash; <code>month</code>, <code>week</code>, <code>list</code>, <code>agenda</code></li>
			<li><code>[eventhub_calendar slug="riverside" view="month" on="2027-01-01"]</code> &mdash; <?php esc_html_e( 'anchored to a specific month', 'eventhub-calendar' ); ?></li>
		</ul>
		<p><?php esc_html_e( 'The calendar is fetched on the server and cached for five minutes, so it appears in your page HTML and is indexable.', 'eventhub-calendar' ); ?></p>
	</div>
	<?php
}

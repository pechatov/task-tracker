#!/usr/bin/env bash
set -euo pipefail

: "${NPM_DATA_DIR:?Set NPM_DATA_DIR}"
: "${TASK_TRACKER_DOMAIN:?Set TASK_TRACKER_DOMAIN}"
: "${TASK_TRACKER_FORWARD_HOST:?Set TASK_TRACKER_FORWARD_HOST}"
: "${TASK_TRACKER_FORWARD_PORT:?Set TASK_TRACKER_FORWARD_PORT}"
: "${TASK_TRACKER_CERTIFICATE_ID:?Set TASK_TRACKER_CERTIFICATE_ID}"

db_path="$NPM_DATA_DIR/database.sqlite"
proxy_dir="$NPM_DATA_DIR/nginx/proxy_host"

mkdir -p "$proxy_dir"

existing_id="$(
  sqlite3 "$db_path" \
    "select id from proxy_host where is_deleted = 0 and domain_names = '[\"$TASK_TRACKER_DOMAIN\"]' limit 1;"
)"

if [[ -n "$existing_id" ]]; then
  proxy_id="$existing_id"
  sqlite3 "$db_path" <<SQL
update proxy_host
set modified_on = datetime('now'),
    forward_host = '$TASK_TRACKER_FORWARD_HOST',
    forward_port = $TASK_TRACKER_FORWARD_PORT,
    certificate_id = $TASK_TRACKER_CERTIFICATE_ID,
    ssl_forced = 1,
    block_exploits = 1,
    allow_websocket_upgrade = 1,
    http2_support = 1,
    forward_scheme = 'http',
    enabled = 1,
    locations = '[]',
    meta = '{"nginx_online":true,"nginx_err":null}'
where id = $proxy_id;
SQL
else
  proxy_id="$(
    sqlite3 "$db_path" "select coalesce(max(id), 0) + 1 from proxy_host;"
  )"
  sqlite3 "$db_path" <<SQL
insert into proxy_host (
  id,
  created_on,
  modified_on,
  owner_user_id,
  is_deleted,
  domain_names,
  forward_host,
  forward_port,
  access_list_id,
  certificate_id,
  ssl_forced,
  caching_enabled,
  block_exploits,
  advanced_config,
  meta,
  allow_websocket_upgrade,
  http2_support,
  forward_scheme,
  enabled,
  locations,
  hsts_enabled,
  hsts_subdomains,
  trust_forwarded_proto
) values (
  $proxy_id,
  datetime('now'),
  datetime('now'),
  1,
  0,
  '["$TASK_TRACKER_DOMAIN"]',
  '$TASK_TRACKER_FORWARD_HOST',
  $TASK_TRACKER_FORWARD_PORT,
  0,
  $TASK_TRACKER_CERTIFICATE_ID,
  1,
  0,
  1,
  '',
  '{"nginx_online":true,"nginx_err":null}',
  1,
  1,
  'http',
  1,
  '[]',
  0,
  0,
  0
);
SQL
fi

cat > "$proxy_dir/$proxy_id.conf" <<CONF
# ------------------------------------------------------------
# $TASK_TRACKER_DOMAIN
# ------------------------------------------------------------

map \$scheme \$hsts_header {
    https   "max-age=63072000; preload";
}

server {
  set \$forward_scheme http;
  set \$server         "$TASK_TRACKER_FORWARD_HOST";
  set \$port           $TASK_TRACKER_FORWARD_PORT;

  listen 80;
listen [::]:80;

listen 443 ssl;
listen [::]:443 ssl;


  server_name $TASK_TRACKER_DOMAIN;

  http2 on;


  # Let's Encrypt SSL
  include conf.d/include/letsencrypt-acme-challenge.conf;
  include conf.d/include/ssl-cache.conf;
  include conf.d/include/ssl-ciphers.conf;
  ssl_certificate /etc/letsencrypt/live/npm-$TASK_TRACKER_CERTIFICATE_ID/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/npm-$TASK_TRACKER_CERTIFICATE_ID/privkey.pem;


  # Block Exploits
  include conf.d/include/block-exploits.conf;


    # Force SSL
    set \$trust_forwarded_proto "F";
    include conf.d/include/force-ssl.conf;


proxy_set_header Upgrade \$http_upgrade;
proxy_set_header Connection \$http_connection;
proxy_http_version 1.1;


  access_log /data/logs/proxy-host-${proxy_id}_access.log proxy;
  error_log /data/logs/proxy-host-${proxy_id}_error.log warn;

  location / {
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$http_connection;
    proxy_http_version 1.1;

    # Proxy!
    include conf.d/include/proxy.conf;
  }

  # Custom
  include /data/nginx/custom/server_proxy[.]conf;
}
CONF

echo "Configured Nginx Proxy Manager proxy host $proxy_id for $TASK_TRACKER_DOMAIN."
echo "Reload or restart Nginx Proxy Manager if the new host is not active immediately."

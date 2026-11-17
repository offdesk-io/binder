"""The files setup-server.sh installs agree with each other and with
binder/config.py, and the nginx block never lets a browser's own sign-in
headers reach Binder."""

import re
from pathlib import Path

from binder.config import load_settings

DEPLOY = Path(__file__).resolve().parents[1] / "deploy"


def read(name):
    return (DEPLOY / name).read_text()


def block(text, header):
    """The body of the first `header { ... }` block."""
    start = text.index(header)
    i = text.index("{", start) + 1
    depth, j = 1, i
    while depth:
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
        j += 1
    return text[i:j - 1]


def lines(body):
    return [ln.strip() for ln in body.splitlines() if ln.strip() and not ln.strip().startswith("#")]


def env_example():
    env = {}
    for ln in lines(read("binder.env.example")):
        key, _, value = ln.partition("=")
        env[key] = value
    return env


def test_the_settings_template_is_a_valid_server_configuration():
    s = load_settings(env_example())
    assert s.auth == "header"
    assert s.db_path == "/var/lib/binder/binder.db"
    assert (s.host, s.port) == ("127.0.0.1", 8770)
    assert s.team == "offdesk"
    assert s.ai == "off"  # until the owner adds ANTHROPIC_API_KEY
    assert not s.bench_token  # the Bench link starts off


def test_nginx_overwrites_every_sign_in_header_and_drops_authorization():
    # the trailing space keeps "location / " from matching "location /auth/"
    app = lines(block(read("nginx-binder.conf"), "location / "))
    assert "auth_request /_offdesk_check;" in app
    for header, var in [("Email", "email"), ("Name", "name"), ("Teams", "teams")]:
        assert "auth_request_set $offdesk_%s $upstream_http_x_offdesk_%s;" % (var, var) in app
        assert "proxy_set_header X-Offdesk-%s $offdesk_%s;" % (header, var) in app
    assert 'proxy_set_header X-Offdesk-Board "";' in app
    assert 'proxy_set_header Authorization "";' in app
    assert "error_page 401 = @login;" in app
    assert "proxy_pass http://127.0.0.1:8770;" in app


def test_nginx_asks_the_sign_in_service_internally_and_names_no_domain():
    conf = read("nginx-binder.conf")
    check = lines(block(conf, "location = /_offdesk_check"))
    assert "internal;" in check
    assert "proxy_pass http://127.0.0.1:3000/auth/check;" in check
    assert "proxy_pass_request_body off;" in check
    assert "proxy_pass http://127.0.0.1:3000;" in lines(block(conf, "location /auth/"))
    assert "server_name @DOMAIN@;" in lines(block(conf, "server {"))
    assert "offdesk.io" not in conf


def test_nginx_has_no_unguarded_route_to_binder():
    conf = read("nginx-binder.conf")
    assert conf.count("proxy_pass http://127.0.0.1:8770") == 1
    app = lines(block(conf, "location / "))
    assert "proxy_pass http://127.0.0.1:8770;" in app
    assert "auth_request /_offdesk_check;" in app
    assert "underscores_in_headers on" not in conf
    assert "proxy_pass_request_headers off" not in conf


def test_nginx_sets_every_sign_in_header_binder_reads():
    read_by_binder = set(re.findall(r"x-offdesk-([a-z]+)", read_auth(), re.I))
    assert read_by_binder
    app = lines(block(read("nginx-binder.conf"), "location / "))
    for name in read_by_binder:
        assert any(ln.lower().startswith("proxy_set_header x-offdesk-%s " % name.lower()) for ln in app), name


def read_auth():
    return (DEPLOY.parent / "binder" / "auth.py").read_text()


def test_the_service_runs_binder_as_its_own_user_with_only_its_data_writable():
    unit = lines(read("binder.service"))
    for want in ["User=binder", "Group=binder", "WorkingDirectory=/opt/binder/app",
                 "EnvironmentFile=/etc/binder/binder.env",
                 "ExecStart=/opt/binder/app/.venv/bin/python -m binder",
                 "ProtectSystem=strict", "ReadWritePaths=/var/lib/binder", "NoNewPrivileges=true",
                 "RestartPreventExitStatus=2", "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6"]:
        assert want in unit
    assert "MemoryDenyWriteExecute=true" not in unit


def test_both_units_are_hardened():
    for name in ["binder.service", "binder-backup.service"]:
        unit = lines(read(name))
        for want in ["UMask=0077", "PrivateTmp=true", "ProtectHome=true", "PrivateDevices=true",
                     "ProtectKernelTunables=true", "ProtectKernelModules=true",
                     "ProtectControlGroups=true", "RestrictSUIDSGID=true",
                     "LockPersonality=true", "CapabilityBoundingSet="]:
            assert want in unit, (name, want)


def test_the_nightly_backup_keeps_30_days_and_runs_late_runs_on_boot():
    service = lines(read("binder-backup.service"))
    assert ("ExecStart=/opt/binder/app/.venv/bin/python -m binder.backup /var/lib/binder/binder.db "
            "/var/lib/binder/nightly --prefix nightly --keep-days 30") in service
    assert "User=binder" in service
    timer = lines(read("binder-backup.timer"))
    assert "OnCalendar=*-*-* 03:30:00 Europe/Lisbon" in timer
    assert "Persistent=true" in timer


def test_the_deploy_script_defaults_match_the_server_layout():
    script = read("deploy-on-server.sh")
    assert 'APP="${BINDER_APP:-/opt/binder/app}"' in script
    assert 'DB="${BINDER_DB_PATH:-/var/lib/binder/binder.db}"' in script
    assert 'HEALTH="${BINDER_HEALTH_URL:-http://127.0.0.1:8770/api/health}"' in script

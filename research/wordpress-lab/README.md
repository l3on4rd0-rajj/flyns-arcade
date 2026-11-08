# WordPress local security lab

This lab is local-only. The WordPress container binds to `127.0.0.1:8080`; the database has no published port. Do not point tests at a public WordPress site.

The image is pinned to the current WordPress release selected for the lab. The plugin fixture is mounted read-only so test code cannot silently mutate the target environment.

## Start

```text
docker compose up -d
```

Open `http://127.0.0.1:8081/` and complete the disposable WordPress setup. Use only synthetic credentials and content.

## Stop and remove lab data

```text
docker compose down -v
```

The `-v` option removes only the two named lab volumes declared in this compose file.

## Research boundary

The fixture exists only to validate scanners and PoC harnesses. A CVE candidate must be reproduced in a real third-party open-source plugin or WordPress component, with the affected version, security boundary, root cause, and fixed version documented independently of this fixture.

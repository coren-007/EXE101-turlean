#!/bin/bash
# Đóng gói source sạch để đẩy lên GitHub (repo EXE101-turlean, nhánh leminh)
# Loại bỏ: node_modules, .next, .git, .env (bảo mật), db/, và các thư mục sandbox
set -e

BASE=/home/z/my-project
STAGE=$BASE/.stage-zip/EXE101-turlean
OUT=$BASE/download/EXE101-turlean-leminh-src.zip

rm -rf "$BASE/.stage-zip" "$OUT"
mkdir -p "$STAGE"

# ---- Code nguồn & tài nguyên ----
cp -r "$BASE/src"                "$STAGE/src"
cp -r "$BASE/prisma"             "$STAGE/prisma"
cp -r "$BASE/public"             "$STAGE/public"
cp -r "$BASE/scripts"            "$STAGE/scripts"
cp -r "$BASE/.github"            "$STAGE/.github"

# ---- Schema cho PRODUCTION (repo GitHub dung PostgreSQL/Supabase) ----
python3 - << 'PYEOF'
import os
p = os.path.join(os.environ.get('STAGE', '/home/z/my-project/.stage-zip/EXE101-turlean'), 'prisma/schema.prisma')
local = open(p).read()
old_ds = '''datasource db {
  provider  = "sqlite"
  url       = env("DATABASE_URL")
  // Sandbox local: SQLite (để live preview không cần PostgreSQL/Supabase)
  // Bản production trên GitHub dùng postgresql + DIRECT_URL (Supabase)
}'''
new_ds = '''datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
  // Production: PostgreSQL (Supabase / Neon / Vercel Postgres)
  // DIRECT_URL cần thiết cho Prisma Migrate khi dùng pooled DATABASE_URL
}'''
if old_ds in local:
    open(p, 'w').write(local.replace(old_ds, new_ds))
    print('  (schema.prisma ZIP: PostgreSQL cho production)')
else:
    print('  (schema.prisma: giu nguyen — khong thay datasource SQLite)')
PYEOF

# ---- File cấu hình ----
for f in .gitignore .env.example .dockerignore \
         package.json bun.lock tsconfig.json next.config.ts \
         postcss.config.mjs eslint.config.mjs components.json; do
  cp "$BASE/$f" "$STAGE/$f"
done

# ---- Tài liệu & triển khai ----
for f in README.md CHANGELOG.md QUICKSTART.md DEPLOYMENT.md \
         Dockerfile docker-compose.yml Caddyfile vercel.json; do
  cp "$BASE/$f" "$STAGE/$f"
done

# ---- Nén ----
cd "$BASE/.stage-zip"
zip -rq "$OUT" EXE101-turlean
rm -rf "$BASE/.stage-zip"

echo "DONE: $OUT"
ls -lh "$OUT"
unzip -l "$OUT" | tail -3

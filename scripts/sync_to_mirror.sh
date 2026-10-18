#!/bin/bash
# sync_to_mirror.sh — đồng bộ toàn bộ source sandbox → git mirror EXE101-turlean (branch leminh)
# Gồm: src/ public/ scripts/ (không logs) .github/ prisma/ (schema chuyển sang PostgreSQL) + configs + docs
# Lưu ý: schema.prisma sandbox là SQLite — mirror/GitHub dùng PostgreSQL (Supabase).
set -e
BASE=/home/z/my-project
MIR=$BASE/EXE101-turlean

cd "$MIR"
[ -d .git ] || { echo "LOI: khong thay git mirror"; exit 1; }

# 1) Source & tài nguyên
rm -rf "$MIR/src" "$MIR/public"
cp -r "$BASE/src" "$MIR/src"
cp -r "$BASE/public" "$MIR/public"

# scripts: copy chọn lọc (bỏ logs/ và ảnh artifact)
rm -rf "$MIR/scripts"
mkdir -p "$MIR/scripts"
cd "$BASE/scripts"
find . -maxdepth 1 -type f \( -name '*.py' -o -name '*.ts' -o -name '*.sh' -o -name '*.json' \) -exec cp {} "$MIR/scripts/" \;

# .github (nếu sandbox có)
rm -rf "$MIR/.github"
[ -d "$BASE/.github" ] && cp -r "$BASE/.github" "$MIR/.github"

# 2) Prisma — migrations giữ nguyên, schema sandbox (SQLite) → PostgreSQL cho production
rm -rf "$MIR/prisma"
cp -r "$BASE/prisma" "$MIR/prisma"
python3 - << 'PYEOF'
import os
p = '/home/z/my-project/EXE101-turlean/prisma/schema.prisma'
local = open(p).read()
old_sqlite = '''datasource db {
  provider  = "sqlite"
  url       = env("DATABASE_URL")
  // Sandbox local: SQLite (để live preview không cần PostgreSQL/Supabase)
  // Bản production trên GitHub dùng postgresql + DIRECT_URL (Supabase)
}'''
new_pg = '''datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
  // Production: PostgreSQL (Supabase / Neon / Vercel Postgres)
  // DIRECT_URL cần thiết cho Prisma Migrate khi dùng pooled DATABASE_URL
}'''
if old_sqlite in local:
    open(p, 'w').write(local.replace(old_sqlite, new_pg))
    print('schema.prisma: SQLite → PostgreSQL (production)')
else:
    print('schema.prisma: khong thay khoi SQLite — kiem tra tay')
PYEOF

# 3) Cấu hình + tài liệu
for f in .gitignore .env.example .dockerignore \
         package.json bun.lock tsconfig.json next.config.ts \
         postcss.config.mjs eslint.config.mjs components.json; do
  cp "$BASE/$f" "$MIR/$f"
done
for f in README.md CHANGELOG.md QUICKSTART.md DEPLOYMENT.md \
         Dockerfile docker-compose.yml Caddyfile vercel.json; do
  [ -f "$BASE/$f" ] && cp "$BASE/$f" "$MIR/$f"
done

echo "DONE — sync sandbox → mirror. Kiểm tra: git status"
cd "$MIR" && git status --short | head -25

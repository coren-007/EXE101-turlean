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

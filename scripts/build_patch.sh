#!/bin/bash
# Build patch: source hien tai (phase 5 tim kiem & ket noi v2) so voi nhanh leminh tren GitHub
# Base: .tmp-base-repo (clone moi cua coren-007/EXE101-turlean, nhanh leminh)
# Output: download/EXE101-turlean-leminh-phase5.patch
set -e

BASE=/home/z/my-project
TGT=$BASE/.tmp-base-repo
OUT=$BASE/download/EXE101-turlean-leminh-repeatweeks-fix.patch

[ -d "$TGT/.git" ] || { echo "LOI: khong tim thay clone base tai $TGT"; exit 1; }

# 0) Cap nhat base theo nhanh leminh moi nhat tren GitHub
#    (phong truong hop user da push patch truoc do — patch moi chi chua delta that su)
cd "$TGT"
git fetch origin leminh --quiet 2>/dev/null || echo "(khong fetch duoc — dung base hien co)"
git reset --hard origin/leminh --quiet 2>/dev/null || git reset --hard HEAD --quiet
git clean -fdq

# 1) Xoa sach worktree cua clone (giu .git) + reset index ve HEAD
# (index lan chay truoc da bi stage mode 755 → phai reset moi sach)
cd "$TGT"
git config core.fileMode true
find . -mindepth 1 -maxdepth 1 -not -name .git -exec rm -rf {} +
git reset -q

# 2) Copy dung bo file giong pack_for_github.sh
cp -r "$BASE/src"      src
cp -r "$BASE/prisma"   prisma
cp -r "$BASE/public"   public
cp -r "$BASE/scripts"  scripts
cp -r "$BASE/.github"  .github

# 2b) Schema cho PRODUCTION: repo tren GitHub dang dung PostgreSQL (Supabase)
#     → đè schema.prisma trong staging bang ban datasource postgresql (models giu nguyen local)
python3 - << 'PYEOF'
local = open('prisma/schema.prisma').read()
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
assert old_ds in local, 'datasource block SQLite khong tim thay trong schema local!'
open('prisma/schema.prisma', 'w').write(local.replace(old_ds, new_ds))
print('  (schema.prisma staging: PostgreSQL cho production)')
PYEOF

for f in .gitignore .env.example .dockerignore \
         package.json bun.lock tsconfig.json next.config.ts \
         postcss.config.mjs eslint.config.mjs components.json \
         README.md CHANGELOG.md QUICKSTART.md DEPLOYMENT.md \
         Dockerfile docker-compose.yml Caddyfile vercel.json; do
  cp "$BASE/$f" "$f"
done

# 3) Bo script dong goi/debug chi danh cho sandbox (khong dua vao repo nguoi dung)
rm -f scripts/build_patch.sh scripts/verify_patch.sh scripts/check_avail.ts scripts/check_avail2.ts

# 4) Dong bo mode file ve 644 nhu remote (tranh nhieu "mode change" trong patch)
#    LUU Y: chi tru dung thu muc .git/ — pattern './.git*' sai vi khop ca .gitignore/.github
find . -mindepth 1 -not -path './.git/*' -type f -exec chmod 644 {} +

# 5) Stage toan bo va sinh patch
git add -A
git diff --cached > "$OUT"

echo "=== PATCH: $OUT ==="
ls -lh "$OUT"
echo
echo "=== TONG SO FILE THAY DOI ==="
git diff --cached --name-only | wc -l
echo
echo "=== DANH SACH FILE ==="
git diff --cached --name-status
echo
echo "=== THONG KE ==="
git diff --cached --stat | tail -30

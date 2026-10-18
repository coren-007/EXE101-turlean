#!/bin/bash
# Xac minh patch: apply thu tren clone moi + so sanh cay ket qua voi source goc
set -e
BASE=/home/z/my-project
OUT=$BASE/download/EXE101-turlean-leminh-repeatweeks-fix.patch
URL=https://github.com/coren-007/EXE101-turlean.git
VER=$BASE/.tmp-verify-repo

[ -s "$OUT" ] || { echo "LOI: patch khong ton tai hoac rong"; exit 1; }

rm -rf "$VER"
git clone --depth 1 -b leminh "$URL" "$VER" 2>&1 | tail -1
cd "$VER"

echo "=== 1) KIEM TRA APPLY (dry-run) ==="
git apply --check "$OUT" && echo "APPLY CHECK: OK"

echo "=== 2) APPLY THUC TE ==="
git apply "$OUT" && echo "APPLY: OK"

echo "=== 3) SO SANH CAY KET QUA VOI SOURCE GOC ==="
if diff -r --exclude=.git "$VER" "$BASE/.tmp-base-repo" > /dev/null 2>&1; then
  echo "CAY FILE: IDENTICAL"
else
  echo "CAY FILE: KHAC NHAU:"
  diff -r --exclude=.git "$VER" "$BASE/.tmp-base-repo" 2>&1 | head -20
fi

echo "=== 4) QUET BAO MAT ==="
if grep -nE 'ghp_[A-Za-z0-9]{20,}|github_pat_|service_role' "$OUT"; then
  echo "CANH BAO: nghi van secret — KIEM TRA LAI!"
else
  echo "KHONG TIM THAY SECRET (PAT/service_role)"
fi

echo "=== 5) NOI DUNG DUNG DAN ==="
echo "enrollDeadline xuat hien: $(grep -c 'enrollDeadline' "$OUT") lan"
echo "student-schedule xuat hien: $(grep -c 'student-schedule' "$OUT") lan"

rm -rf "$VER"
echo "=== VERIFY DONE ==="

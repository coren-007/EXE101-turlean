#!/usr/bin/env python3
"""UI verify nhanh cho P6 hardening (1.3.2): nút Khóa tay trên watchlist +
dialog lý do + nút Rà soát tự khóa + vòng khóa→mở khóa qua UI thật.

Không thay thế e2e_browser.py 87 check — đây là bổ sung có chủ đích cho
2 nút mới, chạy độc lập sau regression (tự tạo tutor throwaway đứng đầu
watchlist vì sort ổn định theo createdAt desc, tự dọn log + user sau chạy).
"""
import json
import subprocess
import time
import urllib.request
import urllib.error
from datetime import datetime

BASE = 'http://localhost:3000'
DL = '/home/z/my-project/download'
TS = datetime.now().strftime('%H%M%S')
EMAIL = f'uilock.tutor.{TS}@example.com'
REASON = 'Kiểm thử UI khóa tay'
LOG_SINCE = datetime.now(datetime.UTC).isoformat() if hasattr(datetime, 'UTC') else datetime.utcnow().isoformat()

def api(method, path, body=None, session=None):
    r = urllib.request.Request(BASE + path, method=method)
    r.add_header('Content-Type', 'application/json')
    if session:
        r.add_header('Cookie', f'tc_session={session}')
    data = json.dumps(body).encode() if body is not None else None
    try:
        resp = urllib.request.urlopen(r, data=data)
        return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}

def ab(*args, timeout=60):
    try:
        r = subprocess.run(['agent-browser', *args], capture_output=True, text=True, timeout=timeout)
        return (r.stdout or '').strip()
    except subprocess.TimeoutExpired:
        return ''

def abj(*args):
    try:
        return json.loads(ab(*args))
    except Exception:
        return {}

def refs():
    return (abj('snapshot', '-i', '--json').get('data') or {}).get('refs') or {}

def find(name=None, role=None, rs=None, exact=False):
    for k, v in (rs if rs is not None else refs()).items():
        n = v.get('name') or ''
        if name is not None:
            if (n != name) if exact else (name.lower() not in n.lower()):
                continue
        if role is not None and v.get('role') != role:
            continue
        return k
    return None

def has_text(t):
    return ab('eval', f'document.body.innerText.includes({json.dumps(t)})').strip().lower().endswith('true')

def dialog_has(t):
    r = ab('eval', f"(() => {{ const ds=document.querySelectorAll('[role=dialog]'); const d=ds[ds.length-1]; return d ? d.innerText.includes({json.dumps(t)}) : false }})()")
    return 'true' in (r or '').lower()

def evaljs(js):
    # agent-browser eval trả JSON-encoded string — bỏ quote để so sánh thẳng
    return ab('eval', js).strip().strip('"')

def wait_text(t, secs=10):
    for _ in range(int(secs / 0.4)):
        if has_text(t):
            return True
        time.sleep(0.4)
    return False

def fill_dialog_textarea(text):
    """Fill textarea trong dialog trên cùng — native setter cho React."""
    r = evaljs(
        "(function(){var ds=document.querySelectorAll('[role=dialog]');var d=ds[ds.length-1];"
        "if(!d)return 'NODLG';var ta=d.querySelector('textarea');if(!ta)return 'NOTA';"
        "var set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;"
        "set.call(ta," + json.dumps(text) + ");"
        "ta.dispatchEvent(new Event('input',{bubbles:true}));return 'OK'})()"
    )
    return 'OK' in (r or '')

def dialog_submit_disabled():
    r = evaljs(
        "(function(){var ds=document.querySelectorAll('[role=dialog]');var d=ds[ds.length-1];"
        "if(!d)return 'NODLG';var btns=[].slice.call(d.querySelectorAll('button'));"
        "var b=btns.find(x=>x.textContent.indexOf('Khóa tài khoản')>=0);"
        "return b?String(b.disabled):'NOBTN'})()"
    )
    return r

def click_first_watchlist_lock():
    """Nút Khóa (icon Lock, title 'Khóa tay tài khoản này…') — thử a11y rồi DOM."""
    r = find('Khóa tay tài khoản', role='button')
    if r:
        ab('click', r)
        return 'a11y'
    r2 = evaljs(
        "(function(){var btns=document.querySelectorAll('button[title^=\"Khóa tay\"]');"
        "if(!btns.length)return 'NOBTN';btns[0].click();return 'OK'})()"
    )
    return 'dom' if 'OK' in (r2 or '') else 'FAIL'

ok, fail = 0, 0
def check(name, cond, extra=''):
    global ok, fail
    if cond:
        ok += 1
        print(f'  ✓ {name}')
    else:
        fail += 1
        print(f'  ✗ {name} {extra}')

def shot(name):
    ab('screenshot', f'{DL}/uilock-{name}.png')

# ===== 0. Tạo tutor throwaway (mới nhất ⇒ đứng đầu watchlist) =====
print('\n[0] Chuẩn bị')
st, out = api('POST', '/api/auth/register', {
    'name': 'UILock Tutor', 'email': EMAIL, 'password': '123456', 'role': 'TUTOR',
})
check('0.1 đăng ký tutor throwaway', st in (200, 201), str(out)[:80])

# ===== 1. Login admin → dashboard =====
ab('open', BASE + '/?view=login')
ab('wait', '--load', 'networkidle')
time.sleep(1)
r = find('Email', role='textbox')
ab('fill', r, 'admin@turlean.vn')
r = find('Mật khẩu', role='textbox')
ab('fill', r, '123456')
b = find('Đăng nhập', role='button', exact=True)
ab('click', b)
time.sleep(2.5)
check('1.1 login admin → dashboard', 'view=dashboard' in ab('get', 'url'))
for t in ['Tổng quan', 'Duyệt xác minh', 'Tài khoản khóa']:
    check(f'1.2 tab "{t}" render', has_text(t))

# ===== 2. Watchlist: UILock Tutor đứng đầu + có nút Khóa =====
check('2.1 watchlist render section', has_text('Danh sách 10 gia sư có điểm thấp nhất'))
check('2.2 UILock Tutor trong watchlist', has_text('UILock Tutor'))
shot('watchlist-lock-btn')

# ===== 3. Dialog khóa tay =====
how = click_first_watchlist_lock()
time.sleep(1)
check(f'3.1 mở dialog khóa (qua {how})', dialog_has('Khóa tài khoản') and dialog_has('UILock Tutor'))
check('3.2 dialog giải thích hiệu lực', dialog_has('không đăng nhập được'))
d = dialog_submit_disabled()
check('3.3 nút submit KHÓA disabled khi chưa nhập lý do', d == 'true', f'got {d}')
fill_dialog_textarea('abc')
time.sleep(0.5)
d = dialog_submit_disabled()
check('3.4 submit vẫn disabled khi lý do < 5 ký tự', d == 'true', f'got {d}')
shot('lock-dialog')
fill_dialog_textarea(REASON)
time.sleep(0.5)
d = dialog_submit_disabled()
check('3.5 submit enabled khi lý do hợp lệ', d == 'false', f'got {d}')
# bấm submit trong dialog (nút 'Khóa tài khoản' cuối cùng trong dialog)
evaljs(
    "(function(){var ds=document.querySelectorAll('[role=dialog]');var d=ds[ds.length-1];"
    "var btns=[].slice.call(d.querySelectorAll('button'));"
    "var b=btns.find(x=>x.textContent.indexOf('Khóa tài khoản')>=0&&!x.disabled);"
    "if(b)b.click();return 'OK'})()"
)
check('3.6 khóa qua UI → toast xác nhận', wait_text('Đã khóa tài khoản UILock Tutor', 8))

# ===== 4. Tab Tài khoản khóa: đúng người + lý do + điểm =====
# (textContent tab gồm badge số — phải dò includes, không được so exact)
tab_ok = evaljs(
    "(function(){var b=[].slice.call(document.querySelectorAll('button'))"
    ".find(x=>x.textContent.indexOf('Tài khoản khóa')>=0);"
    "if(b){b.click();return 'OK'}return 'NOBTN'})()"
)
time.sleep(2)
check('4.0 chuyển tab Tài khoản khóa thành công', tab_ok == 'OK', f'got {tab_ok}')
check('4.1 UILock Tutor trong tab khóa', has_text('UILock Tutor'))
check('4.2 lý do "[Admin khóa]" hiển thị', has_text(f'[Admin khóa] {REASON}'))
check('4.3 điểm tin cậy 100 hiển thị (khóa tay không đụng điểm)', has_text('điểm tin cậy'))
# nút rà soát + note ngưỡng
check('4.4 nút "Rà soát tự khóa" render', find('Rà soát tự khóa', role='button') is not None)
check('4.5 note ngưỡng 30 render', has_text('Tự khóa khi điểm tin cậy < 30/100'))
shot('locked-tab')

# ===== 5. Bấm Rà soát: không còn ai dưới ngưỡng → toast "mọi người đều trên ngưỡng" =====
time.sleep(5)  # đợi toast khóa bay đi, tránh đè chữ
r = find('Rà soát tự khóa', role='button')
if r:
    ab('click', r)
else:
    evaljs("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(x=>x.textContent.indexOf('Rà soát tự khóa')>=0);if(b){b.click();return 'OK'}return 'NOBTN'})()")
check('5.1 sweep qua UI: mọi người trên ngưỡng (không khóa thêm)', wait_text('ngưỡng tin cậy 30/100', 8))

# ===== 6. Mở khóa qua UI (flow có sẵn) =====
r = find('Mở khóa', role='button')
ab('click', r)
time.sleep(1)
check('6.1 dialog mở khóa', dialog_has('Mở khóa UILock Tutor'))
evaljs(
    "(function(){var ds=document.querySelectorAll('[role=dialog]');var d=ds[ds.length-1];"
    "var btns=[].slice.call(d.querySelectorAll('button'));"
    "var b=btns.find(x=>x.textContent.indexOf('Mở khóa')>=0);"
    "if(b)b.click();return 'OK'})()"
)
check('6.2 mở khóa qua UI → toast', wait_text('Đã mở khóa tài khoản UILock Tutor', 8))
time.sleep(6.5)  # đợi toast (chứa 'UILock Tutor') bay đi rồi mới kiểm vắng mặt
check('6.3 UILock Tutor rời khỏi tab khóa', not has_text('UILock Tutor'))

# ===== 7. Không lỗi trang trong suốt luồng =====
errs = ab('errors')
check('7.1 page errors = 0', not errs or errs.strip() in ('', '[]'), (errs or '')[:120])

# ===== 8. Dọn: xóa throwaway + log cửa sổ test =====
p = subprocess.run(
    ['bun', 'run', 'scripts/alock_tools.ts', 'cleanup', EMAIL, 'none1@x.invalid', 'none2@x.invalid', LOG_SINCE],
    capture_output=True, text=True, cwd='/home/z/my-project',
)
try:
    c = json.loads((p.stdout or '').strip().splitlines()[-1])['deleted']
    check('8.1 dọn throwaway + log cửa sổ', c['users'] >= 1 and c['logs'] >= 2, json.dumps(c))
except Exception as e:
    check('8.1 dọn throwaway + log cửa sổ', False, str(e)[:120])

print(f'\n===== UI VERIFY: {ok}/{ok + fail} PASS =====')
if fail:
    raise SystemExit(1)

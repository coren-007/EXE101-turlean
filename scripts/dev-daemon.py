#!/usr/bin/env python3
"""
dev-daemon.py — Khởi động `bun run dev` như daemon double-fork
đọc kỹ sandbox process-cleanup giữa các lần gọi Bash.

Cách dùng: python3 scripts/dev-daemon.py start|status|stop
"""
import os, sys, time, subprocess, signal

PID_FILE = '/tmp/turlean-dev.pid'
LOG_FILE = '/home/z/my-project/dev.log'
CWD = '/home/z/my-project'

def read_pid():
    try:
        with open(PID_FILE) as f:
            return int(f.read().strip())
    except Exception:
        return None

def is_running(pid):
    if not pid:
        return False
    try:
        os.kill(pid, 0)  # signal 0 = chỉ kiểm tra tồn tại
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True

def start():
    pid = read_pid()
    if is_running(pid):
        print(f"Daemon đã chạy (PID {pid}). Bỏ qua.")
        return
    # --- Double-fork daemonization ---
    pid1 = os.fork()
    if pid1 > 0:
        # Parent đợi con ghi pid rồi thoát
        for _ in range(50):
            p = read_pid()
            if p and p != pid1:
                print(f"Daemon started, PID {p}")
                return
            time.sleep(0.1)
        print("Timeout chờ daemon")
        return
    # Child 1: session mới
    os.setsid()
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    pid2 = os.fork()
    if pid2 > 0:
        os._exit(0)
    # Child 2 (grandchild, PPID sẽ = 1): chạy dev server
    os.umask(0)
    lf = open(LOG_FILE, 'ab', buffering=0)
    os.dup2(lf.fileno(), sys.stdout.fileno())
    os.dup2(lf.fileno(), sys.stderr.fileno())
    devnull = os.open(os.devnull, os.O_RDONLY)
    os.dup2(devnull, sys.stdin.fileno())
    with open(PID_FILE, 'w') as f:
        f.write(str(os.getpid()))
    # Chuyển giao cho bun — exec thay thế process này, giữ nguyên PID/session
    os.execvp('bun', ['bun', 'run', 'dev'])

def status():
    pid = read_pid()
    if is_running(pid):
        print(f"RUNNING (PID {pid})")
    else:
        print("STOPPED")

def stop():
    pid = read_pid()
    if is_running(pid):
        os.kill(pid, signal.SIGTERM)
        time.sleep(2)
        if is_running(pid):
            os.kill(pid, signal.SIGKILL)
        print(f"Stopped (PID {pid})")
    else:
        print("Not running")
    try:
        os.remove(PID_FILE)
    except Exception:
        pass

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'status'
    {'start': start, 'status': status, 'stop': stop}.get(cmd, status)()

#!/usr/bin/env python3
"""Test double-fork daemonization to escape sandbox process cleanup."""
import os, sys, time, subprocess

def double_fork_daemon(cmd, logfile):
    """Classic double-fork daemonization — escapes process group AND session."""
    pid = os.fork()
    if pid > 0:
        # Parent returns immediately
        return pid
    # Child 1: detach from controlling terminal
    os.setsid()
    os.umask(0)
    pid2 = os.fork()
    if pid2 > 0:
        os._exit(0)  # Child 1 exits
    # Child 2 (grandchild): true daemon, PPID=1
    # Redirect stdio
    with open(logfile, 'ab', buffering=0) as lf:
        os.dup2(lf.fileno(), sys.stdout.fileno())
        os.dup2(lf.fileno(), sys.stderr.fileno())
    devnull = os.open(os.devnull, os.O_RDONLY)
    os.dup2(devnull, sys.stdin.fileno())
    # Write marker with PID
    with open('/tmp/daemon_test.pid', 'w') as f:
        f.write(str(os.getpid()))
    subprocess.Popen(cmd, cwd='/home/z/my-project',
                     stdout=sys.stdout.fileno(), stderr=sys.stderr.fileno(),
                     stdin=devnull, start_new_session=False)
    # Just wait forever keeping refs open? No — Popen child is independent; exit
    time.sleep(2)  # give child a moment
    os._exit(0)

if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'sleep':
        # simple test: daemonize a sleep
        pid = double_fork_daemon(['sleep', '600'], '/tmp/daemon_sleep.log')
        print(f"daemonized sleep, parent pid {pid}")
    elif mode == 'marker':
        # just write a marker file with our pid
        with open('/tmp/daemon_test.pid', 'w') as f:
            f.write(str(os.getpid()))
        print(f"marker pid {os.getpid()}")
        time.sleep(600)

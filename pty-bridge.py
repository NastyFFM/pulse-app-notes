#!/usr/bin/env python3
"""PTY bridge: spawns claude in a real pseudo-terminal,
relays bytes between stdin/stdout and the PTY.
Node.js spawns this script and pipes to/from it."""

import pty, os, sys, select, signal, struct, fcntl, termios

def set_pty_size(fd, cols, rows):
    """Set PTY window size."""
    winsize = struct.pack('HHHH', rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)

def main():
    # Default size, can be updated via control sequence
    cols, rows = 120, 40

    pid, fd = pty.fork()
    if pid == 0:
        # Child: exec claude interactive
        os.environ['TERM'] = 'xterm-256color'
        os.environ['COLORTERM'] = 'truecolor'
        os.execvp('claude', ['claude'])
    else:
        # Parent: relay bytes
        set_pty_size(fd, cols, rows)

        def handle_sigwinch(sig, frame):
            pass  # Size changes come via stdin control messages

        signal.signal(signal.SIGWINCH, handle_sigwinch)
        signal.signal(signal.SIGCHLD, lambda s, f: sys.exit(0))

        # Make stdin non-blocking
        stdin_fd = sys.stdin.fileno()
        stdout_fd = sys.stdout.fileno()

        try:
            while True:
                r, _, _ = select.select([stdin_fd, fd], [], [], 1.0)

                if stdin_fd in r:
                    data = os.read(stdin_fd, 4096)
                    if not data:
                        break
                    # Check for resize control: \x1b[R<cols>;<rows>
                    if data.startswith(b'\x1b[R'):
                        try:
                            parts = data[3:].decode().strip().split(';')
                            if len(parts) == 2:
                                c, ro = int(parts[0]), int(parts[1])
                                set_pty_size(fd, c, ro)
                                continue
                        except:
                            pass
                    os.write(fd, data)

                if fd in r:
                    try:
                        data = os.read(fd, 4096)
                        if not data:
                            break
                        os.write(stdout_fd, data)
                        sys.stdout.flush()
                    except OSError:
                        break
        except (KeyboardInterrupt, OSError):
            pass
        finally:
            try:
                os.kill(pid, signal.SIGTERM)
            except:
                pass

if __name__ == '__main__':
    main()

"""Tap the iOS Simulator at a point given in *device pixels* (the coordinate space of
`xcrun simctl io … screenshot`), by synthesising a click on the Simulator window.

  python3 tap.py <x_px> <y_px> [--swipe x2 y2] [--device-w 1320] [--device-h 2868]

Needs pyobjc-framework-Quartz, so run it as:
  uv run --with pyobjc-framework-Quartz python3 tap.py …
"""
import subprocess
import sys
import time

import Quartz


def window_frame():
    """(x, y, w, h) of the Simulator window in screen points, via the window list —
    no Accessibility permission needed for reading."""
    for w in Quartz.CGWindowListCopyWindowInfo(
            Quartz.kCGWindowListOptionOnScreenOnly | Quartz.kCGWindowListExcludeDesktopElements,
            Quartz.kCGNullWindowID):
        if w.get("kCGWindowOwnerName") == "Simulator" and w.get("kCGWindowLayer") == 0:
            b = w["kCGWindowBounds"]
            if b["Height"] > 300:
                return b["X"], b["Y"], b["Width"], b["Height"]
    raise SystemExit("no Simulator window on screen")


def to_screen(x_px, y_px, dev_w, dev_h):
    """Device pixels -> screen points. The window is the device screen plus a title bar;
    its content keeps the device's aspect ratio, which is what pins down the scale."""
    wx, wy, ww, wh = window_frame()
    scale = ww / dev_w                      # window width == device screen width
    content_h = dev_h * scale
    title_h = wh - content_h                # whatever is left is chrome, at the top
    return wx + x_px * scale, wy + title_h + y_px * scale


def click(x, y, hold=0.05):
    move = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, (x, y), 0)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, move)
    time.sleep(0.05)
    for kind in (Quartz.kCGEventLeftMouseDown, Quartz.kCGEventLeftMouseUp):
        e = Quartz.CGEventCreateMouseEvent(None, kind, (x, y), Quartz.kCGMouseButtonLeft)
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, e)
        if kind == Quartz.kCGEventLeftMouseDown:
            time.sleep(hold)


def drag(x1, y1, x2, y2, steps=18):
    click_down = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, (x1, y1),
                                                Quartz.kCGMouseButtonLeft)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, click_down)
    for i in range(1, steps + 1):
        p = (x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps)
        e = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDragged, p,
                                           Quartz.kCGMouseButtonLeft)
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, e)
        time.sleep(0.012)
    up = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, (x2, y2),
                                        Quartz.kCGMouseButtonLeft)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, up)


def main():
    args = sys.argv[1:]
    dev_w, dev_h = 1320, 2868
    if "--device-w" in args:
        dev_w = int(args[args.index("--device-w") + 1])
    if "--device-h" in args:
        dev_h = int(args[args.index("--device-h") + 1])
    subprocess.run(["osascript", "-e", 'tell application "Simulator" to activate'],
                   capture_output=True)
    time.sleep(0.4)
    x1, y1 = to_screen(float(args[0]), float(args[1]), dev_w, dev_h)
    if "--swipe" in args:
        i = args.index("--swipe")
        x2, y2 = to_screen(float(args[i + 1]), float(args[i + 2]), dev_w, dev_h)
        drag(x1, y1, x2, y2)
        print(f"swiped {x1:.0f},{y1:.0f} -> {x2:.0f},{y2:.0f}")
    else:
        click(x1, y1)
        print(f"tapped {x1:.0f},{y1:.0f}  (window {window_frame()})")


if __name__ == "__main__":
    main()

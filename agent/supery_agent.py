"""
Supery 근태 에이전트 v1.0.0
- Windows ctypes GetLastInputInfo 방식 (백신 친화적, 후킹 없음)
- 15분 PC 비활동 시 자동 휴식 기록
- 활동 재개 시 자동 업무 복귀 기록
- 시스템 트레이 상주 / Windows 시작 프로그램 자동 등록
"""
import sys
import os
import json
import time
import platform
import threading
import ctypes
import winreg
import tkinter as tk
from tkinter import simpledialog, messagebox

import requests
import pystray
from PIL import Image, ImageDraw

# ──────────────────────────────────────────────
#  빌드 전에 아래 URL을 실제 서비스 주소로 변경하세요
API_BASE = "https://office.supery.co.kr/api"
# ──────────────────────────────────────────────

VERSION = "1.0.0"
APP_NAME = "SuperyAgent"
CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".supery_agent.json")
HEARTBEAT_INTERVAL = 60   # 1분마다 체크

api_key: str = ""
running: bool = True


# ── Windows API 유휴 시간 조회 ──────────────────

class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]


def get_idle_seconds() -> float:
    """마우스·키보드 마지막 입력 이후 경과 시간(초) — Windows API 직접 호출"""
    info = LASTINPUTINFO()
    info.cbSize = ctypes.sizeof(info)
    ctypes.windll.user32.GetLastInputInfo(ctypes.byref(info))
    elapsed_ms = ctypes.windll.kernel32.GetTickCount() - info.dwTime
    return elapsed_ms / 1000.0


# ── 설정 파일 ───────────────────────────────────

def load_config() -> dict:
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_config(cfg: dict) -> None:
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False)


# ── Windows 시작 프로그램 등록 ──────────────────

def setup_autostart(enable: bool = True) -> None:
    key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
    try:
        reg = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
        if enable:
            if getattr(sys, "frozen", False):
                exe = f'"{sys.executable}"'
            else:
                exe = f'"{sys.executable}" "{os.path.abspath(__file__)}"'
            winreg.SetValueEx(reg, APP_NAME, 0, winreg.REG_SZ, exe)
        else:
            try:
                winreg.DeleteValue(reg, APP_NAME)
            except FileNotFoundError:
                pass
        winreg.CloseKey(reg)
    except Exception as e:
        print(f"[autostart] {e}")


# ── API 호출 ────────────────────────────────────

def api_post(endpoint: str, data: dict) -> bool:
    try:
        resp = requests.post(
            f"{API_BASE}/{endpoint}",
            json=data,
            headers={"X-Agent-Key": api_key},
            timeout=10,
        )
        return resp.ok
    except Exception as e:
        print(f"[{time.strftime('%H:%M:%S')}] API 오류: {e}")
        return False


# ── 하트비트 루프 ────────────────────────────────

def heartbeat_loop() -> None:
    while running:
        idle = get_idle_seconds()
        api_post("agent/heartbeat", {
            "idle_seconds": int(idle),
            "device": platform.node(),
            "version": VERSION,
        })
        time.sleep(HEARTBEAT_INTERVAL)


# ── 최초 실행 설정 ───────────────────────────────

def first_run_setup() -> str:
    root = tk.Tk()
    root.withdraw()

    messagebox.showinfo(
        "Supery 근태 에이전트",
        f"Supery 근태 에이전트 v{VERSION}\n\n"
        "관리자에게 받은 에이전트 키를 입력하면\n"
        "자동 등록 후 백그라운드에서 실행됩니다.",
        parent=root,
    )

    key = simpledialog.askstring("에이전트 키 입력", "에이전트 키:", parent=root)
    root.destroy()

    if not key or not key.strip():
        sys.exit(0)
    key = key.strip()

    root2 = tk.Tk()
    root2.withdraw()
    try:
        resp = requests.post(
            f"{API_BASE}/agent/register",
            json={
                "device": platform.node(),
                "os": f"{platform.system()} {platform.release()}",
                "version": VERSION,
            },
            headers={"X-Agent-Key": key},
            timeout=15,
        )
        if resp.ok:
            save_config({"api_key": key})
            messagebox.showinfo(
                "등록 완료",
                "에이전트가 등록되었습니다.\n시스템 트레이에서 실행 중인지 확인하세요.",
                parent=root2,
            )
            root2.destroy()
            return key
        else:
            messagebox.showerror("등록 실패", f"키가 올바르지 않습니다. (서버: {resp.status_code})", parent=root2)
            root2.destroy()
            sys.exit(1)
    except Exception as e:
        messagebox.showerror("연결 오류", f"서버에 연결할 수 없습니다.\n{e}", parent=root2)
        root2.destroy()
        sys.exit(1)


# ── 트레이 아이콘 생성 ──────────────────────────

def create_icon() -> Image.Image:
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([4, 4, 60, 60], fill=(37, 99, 235))
    draw.ellipse([22, 22, 42, 42], fill=(255, 255, 255))
    return img


# ── 진입점 ──────────────────────────────────────

def main() -> None:
    global api_key, running

    cfg = load_config()
    api_key = cfg.get("api_key", "")

    if not api_key:
        api_key = first_run_setup()

    setup_autostart(True)

    threading.Thread(target=heartbeat_loop, daemon=True).start()

    # 시작 ping
    api_post("agent/heartbeat", {
        "idle_seconds": int(get_idle_seconds()),
        "device": platform.node(),
        "os": f"{platform.system()} {platform.release()}",
        "version": VERSION,
        "event": "start",
    })

    def on_quit(icon, _):
        global running
        running = False
        icon.stop()

    pystray.Icon(
        APP_NAME,
        create_icon(),
        f"Supery 에이전트 v{VERSION}",
        pystray.Menu(pystray.MenuItem("종료", on_quit)),
    ).run()


if __name__ == "__main__":
    main()

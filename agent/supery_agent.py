"""
Supery 근태 에이전트 v1.2.0
- Windows ctypes GetLastInputInfo 방식 (백신 친화적, 후킹 없음)
- 15분 PC 비활동 시 자동 휴식 기록
- 활동 재개 시 자동 업무 복귀 기록
- 시스템 트레이 상주 / Windows 시작 프로그램 자동 등록
- 워킹데이(월~금) 07:00~15:00 첫 시작 시 출근 확인 팝업
- PC 종료/재시작 시 자동 퇴근 기록
"""
import sys
import os
import json
import time
import platform
import threading
import ctypes
import winreg
import webbrowser
import atexit
import random
import tempfile
import tkinter as tk
from tkinter import simpledialog, messagebox
from datetime import datetime, timezone, timedelta

import requests
import pystray
from PIL import Image, ImageDraw

# ──────────────────────────────────────────────
#  빌드 전에 아래 URL을 실제 서비스 주소로 변경하세요
API_BASE = "https://office.supery.co.kr/api"
WORKSYNC_URL = "https://office.supery.co.kr"
# ──────────────────────────────────────────────

VERSION = "1.2.0"
APP_NAME = "SuperyAgent"
CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".supery_agent.json")
HEARTBEAT_INTERVAL = 60  # 1분마다 체크

KST = timezone(timedelta(hours=9))

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
    # GetTickCount64: 49.7일 업타임 오버플로 방지
    elapsed_ms = ctypes.windll.kernel32.GetTickCount64() - info.dwTime
    return max(elapsed_ms, 0) / 1000.0


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
    """원자적 쓰기 — 저장 중 크래시 발생 시 config 파일 손상 방지"""
    try:
        dir_name = os.path.dirname(CONFIG_PATH)
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=dir_name, delete=False, suffix=".tmp") as tmp:
            json.dump(cfg, tmp, ensure_ascii=False)
            tmp_path = tmp.name
        os.replace(tmp_path, CONFIG_PATH)
    except Exception:
        pass


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
    except Exception:
        pass


# ── 인터넷 연결 확인 ────────────────────────────

def check_internet() -> bool:
    """HEAD 요청으로 연결 확인 — setdefaulttimeout 전역 부작용 없음"""
    try:
        requests.head(WORKSYNC_URL, timeout=5)
        return True
    except Exception:
        return False


# ── 워킹데이 출근 확인 팝업 ──────────────────────

def check_workday_checkin(is_first_run: bool = False) -> None:
    """월~금 07:00~15:00 첫 시작 시 출근 확인 — 메인 스레드에서만 호출"""
    try:
        # 최초 등록 직후에는 건너뜀 (등록 팝업과 연속으로 뜨는 것 방지)
        if is_first_run:
            return

        now_kst = datetime.now(KST)

        # 주말(5=토, 6=일) 제외
        if now_kst.weekday() >= 5:
            return
        # 07:00~15:00 범위 외 제외
        if not (7 <= now_kst.hour < 15):
            return

        today_str = now_kst.strftime("%Y-%m-%d")
        cfg = load_config()

        # 오늘 이미 확인했으면 스킵
        if cfg.get("last_checkin_prompt") == today_str:
            return

        # 오늘은 다시 묻지 않도록 먼저 저장 (크래시 방지)
        cfg["last_checkin_prompt"] = today_str
        save_config(cfg)

        # 인터넷 연결 확인
        if not check_internet():
            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            messagebox.showwarning(
                "WorkSync",
                "인터넷이 연결되지 않아 출근 등록을 할 수 없습니다.\n"
                "인터넷 연결 후 WorkSync에서 직접 출근 등록해주세요.",
                parent=root,
            )
            root.destroy()
            return

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        answer = messagebox.askyesno(
            "WorkSync 출근 확인",
            "업무를 시작하시겠습니까?\n\n"
            "[예]를 클릭하면 WorkSync 출근 등록 페이지가 열립니다.",
            parent=root,
        )
        root.destroy()

        if answer:
            webbrowser.open(f"{WORKSYNC_URL}/attendance")

    except Exception:
        pass  # 팝업 오류가 에이전트 전체를 종료하지 않도록


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
    except Exception:
        return False


# ── PC 종료 시 자동 퇴근 ────────────────────────

def on_agent_exit() -> None:
    """에이전트 종료(PC 꺼짐/재시작/트레이 종료) 시 퇴근 처리"""
    if not api_key:
        return
    try:
        requests.post(
            f"{API_BASE}/agent/checkout",
            json={"device": platform.node(), "version": VERSION},
            headers={"X-Agent-Key": api_key},
            timeout=3,  # Windows 종료 시 짧게 설정 (5초 내 정리 필요)
        )
    except Exception:
        pass


# ── 하트비트 루프 ────────────────────────────────

def heartbeat_loop() -> None:
    # 썬더링 허드 방지: 여러 PC가 동시에 시작할 때 요청이 몰리지 않도록 초기 지터
    time.sleep(random.uniform(0, 30))
    while running:
        try:
            idle = get_idle_seconds()
            api_post("agent/heartbeat", {
                "idle_seconds": int(idle),
                "device": platform.node(),
                "version": VERSION,
            })
        except Exception:
            pass  # 예외가 루프를 종료하지 않도록 — 다음 주기에 재시도
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
            messagebox.showerror(
                "등록 실패",
                f"키가 올바르지 않습니다. (서버: {resp.status_code})",
                parent=root2,
            )
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

    is_first_run = not api_key
    if is_first_run:
        api_key = first_run_setup()

    setup_autostart(True)
    atexit.register(on_agent_exit)

    threading.Thread(target=heartbeat_loop, daemon=True).start()

    # 시작 ping
    api_post("agent/heartbeat", {
        "idle_seconds": int(get_idle_seconds()),
        "device": platform.node(),
        "os": f"{platform.system()} {platform.release()}",
        "version": VERSION,
        "event": "start",
    })

    # 워킹데이 출근 확인 (pystray 시작 전, 메인 스레드)
    check_workday_checkin(is_first_run=is_first_run)

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

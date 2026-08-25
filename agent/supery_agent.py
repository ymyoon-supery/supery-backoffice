"""
Supery 근태 에이전트 v1.3.4
- Windows ctypes GetLastInputInfo 방식 (백신 친화적, 후킹 없음)
- 15분 PC 비활동 시 자동 휴식 기록
- 활동 재개 시 자동 업무 복귀 기록
- 시스템 트레이 상주 / Task Scheduler 로그온 작업 등록 (높은 우선순위)
- 워킹데이(월~금) PC 시작 시 출근 확인 팝업 (3배 크기, 시간 제한 없음, 웹 출근 여부 서버 확인)
- PC 종료/재시작 시 자동 퇴근 기록
- 로그 파일: ~/.supery_agent.log (1MB 롤링)
"""
import sys
import os
import json
import time
import logging
import platform
import threading
import subprocess
import ctypes
import winreg
import webbrowser
import atexit
import random
import tempfile
import tkinter as tk
from datetime import datetime, timezone, timedelta
from logging.handlers import RotatingFileHandler

import requests
import pystray
from PIL import Image, ImageDraw

# ──────────────────────────────────────────────
#  빌드 전에 아래 URL을 실제 서비스 주소로 변경하세요
API_BASE = "https://office.supery.co.kr/api"
WORKSYNC_URL = "https://office.supery.co.kr"
# ──────────────────────────────────────────────

VERSION = "1.3.5"
APP_NAME = "SuperyAgent"
CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".supery_agent.json")
LOG_PATH = os.path.join(os.path.expanduser("~"), ".supery_agent.log")
SESSION_PATH = os.path.join(os.path.expanduser("~"), ".supery_session.json")
HEARTBEAT_INTERVAL = 60  # 1분마다 체크

KST = timezone(timedelta(hours=9))

api_key: str = ""
running: bool = True
_checkin_prompted: bool = False  # 이 세션에서 팝업을 이미 표시했는지 (재부팅 시 리셋됨)


# ── 로거 설정 ───────────────────────────────────

def setup_logging() -> None:
    handler = RotatingFileHandler(LOG_PATH, maxBytes=1024 * 1024, backupCount=2, encoding="utf-8")
    logging.basicConfig(
        handlers=[handler],
        level=logging.WARNING,
        format="%(asctime)s %(levelname)s %(message)s",
    )


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
        dir_name = os.path.dirname(CONFIG_PATH) or "."
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=dir_name, delete=False, suffix=".tmp") as tmp:
            json.dump(cfg, tmp, ensure_ascii=False)
            tmp_path = tmp.name
        os.replace(tmp_path, CONFIG_PATH)
    except Exception as e:
        logging.warning(f"[save_config] {e}")


# ── 대형 팝업 다이얼로그 (표준 messagebox의 약 3배 크기) ──

_DIALOG_W = 800
_DIALOG_H = 420
_FONT_MSG = ("맑은 고딕", 22)
_FONT_BTN = ("맑은 고딕", 18)
_BTN_PRIMARY = {
    "bg": "#2563eb", "fg": "white",
    "activebackground": "#1d4ed8", "activeforeground": "white",
}
_BTN_SECONDARY = {
    "bg": "#e5e7eb", "fg": "#374151",
    "activebackground": "#d1d5db", "activeforeground": "#374151",
}


def _make_dialog_root() -> tk.Tk:
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    return root


def _center_geometry(root: tk.Tk, w: int, h: int) -> str:
    root.update_idletasks()
    sw = root.winfo_screenwidth()
    sh = root.winfo_screenheight()
    x = (sw - w) // 2
    y = (sh - h) // 2
    return f"{w}x{h}+{x}+{y}"


def show_large_info(title: str, message: str) -> None:
    root = _make_dialog_root()
    dlg = tk.Toplevel(root)
    dlg.title(title)
    dlg.attributes("-topmost", True)
    dlg.resizable(False, False)
    dlg.geometry(_center_geometry(root, _DIALOG_W, _DIALOG_H))
    dlg.configure(bg="#ffffff")

    frame = tk.Frame(dlg, padx=50, pady=30, bg="#ffffff")
    frame.pack(fill=tk.BOTH, expand=True)
    tk.Label(frame, text=message, font=_FONT_MSG, justify=tk.CENTER,
             wraplength=680, bg="#ffffff").pack(expand=True, pady=(10, 5))
    tk.Button(frame, text="확인", font=_FONT_BTN, width=14, height=2,
              relief=tk.FLAT, cursor="hand2",
              command=dlg.destroy, **_BTN_PRIMARY).pack(pady=18)

    dlg.protocol("WM_DELETE_WINDOW", dlg.destroy)
    dlg.focus_force()
    dlg.grab_set()
    root.wait_window(dlg)
    root.destroy()


def show_large_warning(title: str, message: str) -> None:
    root = _make_dialog_root()
    dlg = tk.Toplevel(root)
    dlg.title(title)
    dlg.attributes("-topmost", True)
    dlg.resizable(False, False)
    dlg.geometry(_center_geometry(root, _DIALOG_W, _DIALOG_H))
    dlg.configure(bg="#ffffff")

    frame = tk.Frame(dlg, padx=50, pady=30, bg="#ffffff")
    frame.pack(fill=tk.BOTH, expand=True)
    tk.Label(frame, text=message, font=_FONT_MSG, justify=tk.CENTER,
             wraplength=680, bg="#ffffff").pack(expand=True, pady=(10, 5))
    tk.Button(frame, text="확인", font=_FONT_BTN, width=14, height=2,
              relief=tk.FLAT, cursor="hand2",
              command=dlg.destroy, **_BTN_SECONDARY).pack(pady=18)

    dlg.protocol("WM_DELETE_WINDOW", dlg.destroy)
    dlg.focus_force()
    dlg.grab_set()
    root.wait_window(dlg)
    root.destroy()


def show_large_error(title: str, message: str) -> None:
    root = _make_dialog_root()
    dlg = tk.Toplevel(root)
    dlg.title(title)
    dlg.attributes("-topmost", True)
    dlg.resizable(False, False)
    dlg.geometry(_center_geometry(root, _DIALOG_W, _DIALOG_H))
    dlg.configure(bg="#ffffff")

    frame = tk.Frame(dlg, padx=50, pady=30, bg="#ffffff")
    frame.pack(fill=tk.BOTH, expand=True)
    tk.Label(frame, text=message, font=_FONT_MSG, justify=tk.CENTER,
             wraplength=680, bg="#ffffff", fg="#dc2626").pack(expand=True, pady=(10, 5))
    tk.Button(frame, text="확인", font=_FONT_BTN, width=14, height=2,
              relief=tk.FLAT, cursor="hand2",
              command=dlg.destroy, **_BTN_SECONDARY).pack(pady=18)

    dlg.protocol("WM_DELETE_WINDOW", dlg.destroy)
    dlg.focus_force()
    dlg.grab_set()
    root.wait_window(dlg)
    root.destroy()


def show_large_yesno(title: str, message: str) -> bool:
    result = [False]
    root = _make_dialog_root()
    dlg = tk.Toplevel(root)
    dlg.title(title)
    dlg.attributes("-topmost", True)
    dlg.resizable(False, False)
    dlg.geometry(_center_geometry(root, _DIALOG_W, _DIALOG_H))
    dlg.configure(bg="#ffffff")

    frame = tk.Frame(dlg, padx=50, pady=30, bg="#ffffff")
    frame.pack(fill=tk.BOTH, expand=True)
    tk.Label(frame, text=message, font=_FONT_MSG, justify=tk.CENTER,
             wraplength=680, bg="#ffffff").pack(expand=True, pady=(10, 5))

    btn_frame = tk.Frame(frame, bg="#ffffff")
    btn_frame.pack(pady=18)

    def on_yes():
        result[0] = True
        dlg.destroy()

    tk.Button(btn_frame, text="예", font=_FONT_BTN, width=14, height=2,
              relief=tk.FLAT, cursor="hand2",
              command=on_yes, **_BTN_PRIMARY).pack(side=tk.LEFT, padx=20)
    tk.Button(btn_frame, text="아니오", font=_FONT_BTN, width=14, height=2,
              relief=tk.FLAT, cursor="hand2",
              command=dlg.destroy, **_BTN_SECONDARY).pack(side=tk.LEFT, padx=20)

    dlg.protocol("WM_DELETE_WINDOW", dlg.destroy)
    dlg.focus_force()
    dlg.grab_set()
    root.wait_window(dlg)
    root.destroy()
    return result[0]


def show_large_input(title: str, prompt: str):
    result = [None]
    root = _make_dialog_root()
    dlg = tk.Toplevel(root)
    dlg.title(title)
    dlg.attributes("-topmost", True)
    dlg.resizable(False, False)
    dlg.geometry(_center_geometry(root, _DIALOG_W, 420))
    dlg.configure(bg="#ffffff")

    frame = tk.Frame(dlg, padx=50, pady=30, bg="#ffffff")
    frame.pack(fill=tk.BOTH, expand=True)
    tk.Label(frame, text=prompt, font=_FONT_MSG, bg="#ffffff").pack(pady=(10, 15))

    entry = tk.Entry(frame, font=("맑은 고딕", 14), width=38, relief=tk.SOLID, bd=1)
    entry.pack(pady=5, ipady=10)
    entry.focus_set()

    btn_frame = tk.Frame(frame, bg="#ffffff")
    btn_frame.pack(pady=22)

    def on_ok():
        val = entry.get().strip()
        result[0] = val if val else None
        dlg.destroy()

    entry.bind("<Return>", lambda e: on_ok())

    tk.Button(btn_frame, text="확인", font=_FONT_BTN, width=14, height=2,
              relief=tk.FLAT, cursor="hand2",
              command=on_ok, **_BTN_PRIMARY).pack(side=tk.LEFT, padx=20)
    tk.Button(btn_frame, text="취소", font=_FONT_BTN, width=14, height=2,
              relief=tk.FLAT, cursor="hand2",
              command=dlg.destroy, **_BTN_SECONDARY).pack(side=tk.LEFT, padx=20)

    dlg.protocol("WM_DELETE_WINDOW", dlg.destroy)
    dlg.grab_set()
    root.wait_window(dlg)
    root.destroy()
    return result[0]


# ── Windows 시작 프로그램 등록 (Task Scheduler 우선) ──

def setup_autostart(enable: bool = True) -> None:
    # 기존 레지스트리 항목 정리 (Task Scheduler로 이관)
    _remove_registry_autostart()
    if enable:
        _setup_task_scheduler()
    else:
        _remove_task_scheduler()


def _remove_registry_autostart() -> None:
    key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
    try:
        reg = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
        try:
            winreg.DeleteValue(reg, APP_NAME)
        except FileNotFoundError:
            pass
        winreg.CloseKey(reg)
    except Exception:
        pass


def _setup_task_scheduler() -> None:
    """Task Scheduler 로그온 작업 등록 — Priority 1(HIGH)로 다른 시작 프로그램보다 빠르게 실행"""
    if getattr(sys, "frozen", False):
        cmd = sys.executable
        args = ""
    else:
        cmd = sys.executable
        args = f'"{os.path.abspath(__file__)}"'

    xml = f"""<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Supery 근태 에이전트 - 자동 시작</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>3</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>{cmd}</Command>
      <Arguments>{args}</Arguments>
    </Exec>
  </Actions>
</Task>"""

    xml_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", encoding="utf-16", delete=False) as f:
            f.write(xml)
            xml_path = f.name

        result = subprocess.run(
            ["schtasks", "/Create", "/F", "/TN", APP_NAME, "/XML", xml_path],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            logging.warning(f"[autostart] Task Scheduler 등록 실패: {result.stderr} — 레지스트리 폴백")
            _setup_registry_autostart()
    except Exception as e:
        logging.warning(f"[autostart] Task Scheduler 예외: {e} — 레지스트리 폴백")
        _setup_registry_autostart()
    finally:
        if xml_path and os.path.exists(xml_path):
            try:
                os.unlink(xml_path)
            except Exception:
                pass


def _remove_task_scheduler() -> None:
    try:
        subprocess.run(
            ["schtasks", "/Delete", "/TN", APP_NAME, "/F"],
            capture_output=True, timeout=10,
        )
    except Exception as e:
        logging.warning(f"[autostart] Task Scheduler 삭제 실패: {e}")


def _setup_registry_autostart() -> None:
    """레지스트리 시작 프로그램 등록 (Task Scheduler 폴백)"""
    key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
    try:
        reg = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
        if getattr(sys, "frozen", False):
            exe = f'"{sys.executable}"'
        else:
            exe = f'"{sys.executable}" "{os.path.abspath(__file__)}"'
        winreg.SetValueEx(reg, APP_NAME, 0, winreg.REG_SZ, exe)
        winreg.CloseKey(reg)
    except Exception as e:
        logging.warning(f"[autostart] 레지스트리 등록 실패: {e}")


# ── 인터넷 연결 확인 ────────────────────────────

def check_internet() -> bool:
    """HEAD 요청으로 연결 확인 — setdefaulttimeout 전역 부작용 없음"""
    try:
        requests.head(WORKSYNC_URL, timeout=5)
        return True
    except Exception:
        return False


# ── 서버에서 오늘 출근 여부 확인 ────────────────

def get_today_checkin_status() -> bool:
    """오늘 이미 CHECK_IN 기록이 있는지 서버에서 확인 — 웹 출근 후 팝업 중복 방지"""
    if not api_key:
        return False
    try:
        resp = requests.get(
            f"{API_BASE}/agent/today-status",
            headers={"X-Agent-Key": api_key},
            timeout=5,
        )
        if resp.ok:
            return bool(resp.json().get("checked_in", False))
    except Exception:
        pass
    return False


# ── 워킹데이 출근 확인 팝업 ──────────────────────

def check_workday_checkin(is_first_run: bool = False) -> None:
    """월~금 첫 시작 시 출근 확인 — 메인 스레드에서만 호출"""
    global _checkin_prompted
    try:
        if is_first_run:
            return

        if _checkin_prompted:
            return

        now_kst = datetime.now(KST)

        if now_kst.weekday() >= 5:
            logging.warning(f"[checkin-popup] 스킵: 주말 weekday={now_kst.weekday()}")
            return
        _checkin_prompted = True

        if not check_internet():
            logging.warning("[checkin-popup] 스킵: 인터넷 없음")
            show_large_warning(
                "WorkSync",
                "인터넷이 연결되지 않아 출근 등록을 할 수 없습니다.\n"
                "인터넷 연결 후 WorkSync에서 직접 출근 등록해주세요.",
            )
            return

        already_in = get_today_checkin_status()
        logging.warning(f"[checkin-popup] get_today_checkin_status={already_in}")
        if already_in:
            return

        logging.warning("[checkin-popup] 팝업 표시")
        answer = show_large_yesno(
            "WorkSync 출근 확인",
            "업무를 시작하시겠습니까?\n\n"
            "[예]를 클릭하면 WorkSync 출근 등록 페이지가 열립니다.",
        )
        if answer:
            webbrowser.open(f"{WORKSYNC_URL}/attendance")

    except Exception as e:
        logging.warning(f"[checkin-popup] 예외: {e}")


# ── 세션 파일 (강제 종료 감지용) ────────────────

def mark_session_start() -> None:
    """에이전트 시작 시 세션 파일 생성 — 정상 종료 전까지 exited_cleanly=False 유지"""
    try:
        data = {"started_at": datetime.now(KST).isoformat(), "exited_cleanly": False}
        with open(SESSION_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except Exception as e:
        logging.warning(f"[session] mark_start: {e}")


def mark_session_end() -> None:
    """정상 종료 시 세션 파일에 exited_cleanly=True 기록"""
    try:
        if os.path.exists(SESSION_PATH):
            with open(SESSION_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["exited_cleanly"] = True
            with open(SESSION_PATH, "w", encoding="utf-8") as f:
                json.dump(data, f)
    except Exception as e:
        logging.warning(f"[session] mark_end: {e}")


def update_session_last_heartbeat() -> None:
    """heartbeat 성공 시 세션 파일에 실제 활동 시각 기록 — 강제 종료 시 실제 퇴근 시각 추적용"""
    try:
        data: dict = {}
        if os.path.exists(SESSION_PATH):
            with open(SESSION_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
        data["last_heartbeat_at"] = datetime.now(KST).isoformat()
        with open(SESSION_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except Exception as e:
        logging.warning(f"[session] update_heartbeat: {e}")


def get_prev_session_last_heartbeat() -> str | None:
    """이전 세션의 마지막 heartbeat 시각 반환 — 재부팅 시 실제 종료 시각 복원용"""
    try:
        if os.path.exists(SESSION_PATH):
            with open(SESSION_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get("last_heartbeat_at")
    except Exception:
        pass
    return None


def was_prev_session_force_killed() -> bool:
    """이전 세션이 강제 종료(PC 꺼짐 등)됐는지 확인 — True면 서버 checkout 미기록 상태"""
    try:
        if os.path.exists(SESSION_PATH):
            with open(SESSION_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            return not data.get("exited_cleanly", True)
    except Exception:
        pass
    return False


# ── PC 종료 시 자동 퇴근 ────────────────────────

def on_agent_exit() -> None:
    """에이전트 종료(PC 꺼짐/재시작/트레이 종료) 시 퇴근 처리
    checkout 성공 시에만 exited_cleanly=True — 실패 시 다음 부팅에서 재시도"""
    if not api_key:
        mark_session_end()
        return
    try:
        resp = requests.post(
            f"{API_BASE}/agent/checkout",
            json={"device": platform.node(), "version": VERSION},
            headers={"X-Agent-Key": api_key},
            timeout=3,  # Windows 종료 시 짧게 설정 (5초 내 정리 필요)
        )
        if resp.ok:
            mark_session_end()
        # checkout 실패 시 mark_session_end() 미호출 → exited_cleanly=False 유지
        # → 다음 부팅 시 was_prev_session_force_killed()=True → 재시도
    except Exception:
        pass  # 네트워크 종료 중 실패 → exited_cleanly=False 유지


def checkout_prev_session() -> None:
    """재부팅 후 이전 세션 퇴근 기록 — 네트워크 준비될 때까지 최대 30초 재시도
    last_active_at: 이전 세션의 마지막 heartbeat 시각 → 실제 종료 시각으로 기록"""
    last_active_at = get_prev_session_last_heartbeat()
    deadline = time.time() + 30
    attempt = 0
    while time.time() < deadline:
        attempt += 1
        try:
            payload: dict = {"device": platform.node(), "version": VERSION, "reason": "prev_session_killed"}
            if last_active_at:
                payload["last_active_at"] = last_active_at
            resp = requests.post(
                f"{API_BASE}/agent/checkout",
                json=payload,
                headers={"X-Agent-Key": api_key},
                timeout=5,
            )
            if resp.ok:
                logging.warning(f"[checkout] prev session checkout ok (attempt {attempt}): {resp.json()}")
                return
        except Exception as e:
            logging.warning(f"[checkout] attempt {attempt} failed: {e}")
        time.sleep(3)
    logging.warning("[checkout] prev session checkout failed after 30s")


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


# ── 하트비트 루프 ────────────────────────────────

def heartbeat_loop() -> None:
    # 썬더링 허드 방지: 여러 PC가 동시에 시작할 때 요청이 몰리지 않도록 초기 지터
    time.sleep(random.uniform(0, 30))
    while running:
        try:
            idle = get_idle_seconds()
            ok = api_post("agent/heartbeat", {
                "idle_seconds": int(idle),
                "device": platform.node(),
                "version": VERSION,
            })
            if ok:
                update_session_last_heartbeat()
        except Exception as e:
            logging.warning(f"[heartbeat] {e}")
        time.sleep(HEARTBEAT_INTERVAL)


# ── 최초 실행 설정 ───────────────────────────────

def first_run_setup() -> str:
    show_large_info(
        "Supery 근태 에이전트",
        f"Supery 근태 에이전트 v{VERSION}\n\n"
        "관리자에게 받은 에이전트 키를 입력하면\n"
        "자동 등록 후 백그라운드에서 실행됩니다.",
    )

    key = show_large_input("에이전트 키 입력", "에이전트 키:")
    if not key:
        sys.exit(0)

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
            show_large_info(
                "등록 완료",
                "에이전트가 등록되었습니다.\n시스템 트레이에서 실행 중인지 확인하세요.",
            )
            return key
        else:
            show_large_error(
                "등록 실패",
                f"키가 올바르지 않습니다. (서버: {resp.status_code})",
            )
            sys.exit(1)
    except Exception as e:
        show_large_error("연결 오류", f"서버에 연결할 수 없습니다.\n{e}")
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

    setup_logging()

    cfg = load_config()
    api_key = cfg.get("api_key", "")

    is_first_run = not api_key
    if is_first_run:
        api_key = first_run_setup()

    setup_autostart(True)
    atexit.register(on_agent_exit)

    # 이전 세션이 강제 종료됐으면 서버에 checkout 기록 (atexit 미실행 보완)
    # 네트워크 미준비 상태일 수 있으므로 최대 30초 재시도 후 check_workday_checkin 호출
    if not is_first_run and was_prev_session_force_killed():
        checkout_prev_session()

    mark_session_start()

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

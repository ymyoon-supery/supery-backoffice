@echo off
chcp 65001 > nul
echo ================================================
echo  Supery 근태 에이전트 빌드
echo ================================================
echo.

echo [1/2] 의존성 설치...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo 의존성 설치 실패
    pause
    exit /b 1
)

echo.
echo [2/2] 실행 파일 빌드...
pyinstaller --onefile --windowed --name SuperyAgent supery_agent.py
if %errorlevel% neq 0 (
    echo 빌드 실패
    pause
    exit /b 1
)

echo.
echo ================================================
echo  완료: dist\SuperyAgent.exe
echo  이 파일을 직원들에게 배포하세요.
echo ================================================
pause

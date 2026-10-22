@echo off
echo ========================================
echo  Smart-BJB - lokaly server
echo ========================================
echo.
echo Firebase config toltyryldy ma? js\firebase-config.js tekser.
echo Mock rezhim (Firebase-siz): brauzerde ?mock=1 kos
echo   mys: http://localhost:8000/index.html?mock=1
echo.
echo Tanadau: python bar bolsa - python, jok bolsa - npx serve
echo.

where python >nul 2>&1
if %errorlevel%==0 (
  echo [python] tabyldy - http://localhost:8000
  echo Telefonnan kiru ushin: ipconfig ^| findstr IPv4  (192.168.x.x)
  echo   mys: http://192.168.x.x:8000/index.html
  echo.
  python -m http.server 8000
  goto :end
)

where py >nul 2>&1
if %errorlevel%==0 (
  echo [py] tabyldy - http://localhost:8000
  py -m http.server 8000
  goto :end
)

where npx >nul 2>&1
if %errorlevel%==0 (
  echo [npx serve] - http://localhost:3000
  npx serve
  goto :end
)

echo Eshbir server tabylmady. Python nemese Node.js ornatyn.
echo   https://www.python.org/downloads/
echo   https://nodejs.org/
pause

:end

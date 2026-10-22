@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set SRC=%~dp0
set DST=%SRC%backups
if not exist "%DST%" mkdir "%DST%"

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value 2^>nul') do set DT=%%I
if not defined DT (
  for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm"') do set DT=%%I
  set STAMP=!DT!
) else (
  set STAMP=!DT:~0,4!-!DT:~4,2!-!DT:~6,2!_!DT:~8,2!-!DT:~10,2!
)

set ZIP=%DST%\smart-bjb-backup-!STAMP!.zip

echo Backing up: %SRC%
echo To: %ZIP%
echo.

where powershell >nul 2>&1
if %errorlevel%==0 (
  powershell -NoProfile -Command "Compress-Archive -Path '%SRC%*' -DestinationPath '%ZIP%' -Force; Write-Host ('OK: ' + '%ZIP%')"
  goto :end
)

where tar >nul 2>&1
if %errorlevel%==0 (
  tar -a -c -f "%ZIP%" -C "%SRC%" .
  echo OK: %ZIP%
  goto :end
)

echo powershell/tar tabylmady - koshirme zhasalmady.
pause
goto :end

:end
echo.
echo Dayyn. Papka: %DST%
pause

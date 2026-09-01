@echo off
title Install Mesa POS
echo Installing Mesa POS...
echo Do not run this from inside the zip. Extract the Mesa-POS folder first.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows-install.ps1"
if errorlevel 1 (
  echo.
  echo Install failed.
  pause
)

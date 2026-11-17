@echo off
rem Installs Campus LMS on Windows. Right-click > Run as administrator.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\windows\install.ps1" %*
pause

@echo off
rem Starts the Campus LMS service. (Same as: lms start)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\windows\lms.ps1" start
pause
